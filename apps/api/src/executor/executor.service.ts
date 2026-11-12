import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { OneClickClient } from "../intents/oneclick.client";
import { OwnerClient } from "@agentvault/sdk";

type JobState =
  | "QUEUED"
  | "QUOTING"
  | "QUOTED"
  | "FUNDING"
  | "FUNDED"
  | "POLLING"
  | "DELIVERED"
  | "REFUNDED"
  | "FAILED";

@Injectable()
export class ExecutorService {
  private readonly logger = new Logger(ExecutorService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneclick: OneClickClient
  ) {}

  start(): void {
    if (process.env.EXECUTOR_ACCOUNT_ID === undefined) return;
    this.timer = setInterval(() => void this.tick(), 5000);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private executorKey(): string {
    return process.env.EXECUTOR_PRIVATE_KEY ?? "";
  }

  private async tick(): Promise<void> {
    const jobs = await this.prisma.crosschainJob.findMany({
      where: { state: { in: ["QUEUED", "QUOTING", "QUOTED", "FUNDING", "POLLING"] }, nextRunAt: { lte: new Date() } },
      take: 5,
    });
    for (const j of jobs) {
      await this.step(j.id).catch((e) => this.logger.warn("job " + String(e)));
    }
    // Queue new jobs for awaiting requests
    const awaiting = await this.prisma.paymentRequest.findMany({
      where: { status: "AWAITING_EXECUTION" },
      take: 5,
    });
    for (const r of awaiting) {
      await this.prisma.crosschainJob.createMany({ data: [{ requestId: r.id }], skipDuplicates: true });
    }
  }

  async step(jobId: string): Promise<void> {
    const job = await this.prisma.crosschainJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const req = await this.prisma.paymentRequest.findUnique({ where: { id: job.requestId } });
    if (!req) return;
    const state = job.state as JobState;
    if (state === "QUEUED") {
      await this.setState(jobId, "QUOTING");
      const quote = await this.oneclick.quote({
        dry: false,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: this.originOf(req.asset),
        depositType: "ORIGIN_CHAIN",
        destinationAsset: String(req.destAsset ?? req.asset),
        amount: req.amount.toString(),
        refundTo: req.vaultId,
        refundType: "ORIGIN_CHAIN",
        recipient: req.address,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
      await this.prisma.crosschainJob.update({
        where: { id: jobId },
        data: { state: "QUOTED", quoteJson: quote as never, depositAddress: String(quote.depositAddress ?? ""), attempts: { increment: 1 } },
      });
      return;
    }
    if (state === "QUOTED") {
      // sanity: recipient and amount must match the request
      const q = (job.quoteJson ?? {}) as Record<string, unknown>;
      const recipientOk = String(q.recipient ?? req.address) === req.address || q.recipient === undefined;
      if (!recipientOk) {
        await this.fail(jobId, "quote recipient mismatch");
        return;
      }
      await this.setState(jobId, "FUNDING");
      const vault = req.vaultId;
      const onchain = await this.prisma.paymentRequest.findUnique({ where: { id: job.requestId } });
      if (!onchain) return;
      const owners = new OwnerClient({
        network: "mainnet",
        accountId: process.env.EXECUTOR_ACCOUNT_ID ?? "executor.near",
        privateKey: this.executorKey(),
      });
      const tx = await owners.call(vault, "execute_crosschain", {
        request_id: Number(onchain.onchainId),
        deposit_address: job.depositAddress ?? "",
      });
      await this.prisma.crosschainJob.update({
        where: { id: jobId },
        data: { state: "FUNDED", fundTxHash: tx },
      });
      return;
    }
    if (state === "FUNDED" || state === "POLLING") {
      await this.setState(jobId, "POLLING");
      const st = await this.oneclick.status(job.depositAddress ?? "");
      if (st.status === "SUCCESS") {
        const owners = new OwnerClient({
          network: "mainnet",
          accountId: process.env.EXECUTOR_ACCOUNT_ID ?? "executor.near",
          privateKey: this.executorKey(),
        });
        const onchain = await this.prisma.paymentRequest.findUnique({ where: { id: job.requestId } });
        if (onchain) {
          await owners.call(req.vaultId, "report_crosschain_result", {
            request_id: Number(onchain.onchainId),
            outcome: "Delivered",
            settlement_ref: job.depositAddress ?? "",
          });
        }
        await this.prisma.crosschainJob.update({ where: { id: jobId }, data: { state: "DELIVERED", verification: "OK" } });
      } else if (st.status === "REFUNDED" || st.status === "FAILED") {
        await this.fail(jobId, `1click ${st.status}`);
      } else {
        await this.prisma.crosschainJob.update({
          where: { id: jobId },
          data: { state: "POLLING", nextRunAt: new Date(Date.now() + 5000) },
        });
      }
    }
  }

  private originOf(asset: string): string {
    if (asset === "NEAR") return "nep141:wrap.near";
    return asset.startsWith("nep141:") ? asset : `nep141:${asset.replace(/^ft:/, "")}`;
  }

  private async setState(jobId: string, state: JobState): Promise<void> {
    await this.prisma.crosschainJob.update({ where: { id: jobId }, data: { state } });
  }

  private async fail(jobId: string, error: string): Promise<void> {
    await this.prisma.crosschainJob.update({
      where: { id: jobId },
      data: { state: "FAILED", lastError: error, nextRunAt: new Date(Date.now() + 60_000) },
    });
    this.logger.error(`job ${jobId} failed: ${error}`);
  }
}
