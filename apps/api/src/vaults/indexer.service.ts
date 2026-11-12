import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EventsService } from "../events.service";
import { PrismaService } from "../prisma.service";
import { ChainClient } from "../chain/chain.client";

interface OnChainRequest {
  id: number;
  agent_pk: string;
  client_ref: string;
  asset: string | Record<string, string>;
  amount: string;
  chain: string;
  address: string;
  dest_asset?: string | null;
  memo?: string | null;
  status: string;
  reason?: string | null;
  deposit_address?: string | null;
  settlement_ref?: string | null;
  created_ns: string | number;
  decided_ns?: string | number | null;
  last_change_seq: string | number;
}

@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainClient,
    private readonly events: EventsService
  ) {}

  onModuleInit(): void {
    const pollMs = Number(process.env.INDEXER_POLL_MS ?? 2500);
    const tick = async (): Promise<void> => {
      try {
        await this.indexAll();
      } catch (e) {
        this.logger.warn("indexer tick failed: " + String(e));
      }
    };
    this.timers.push(setInterval(() => void tick(), pollMs));
    void tick();
  }

  onModuleDestroy(): void {
    this.timers.forEach(clearInterval);
  }

  async indexAll(): Promise<void> {
    const vaults = await this.prisma.vault.findMany();
    for (const v of vaults) {
      await this.indexVault(v.id, Number(v.cursorSeq)).catch(() => v.health === "degraded");
    }
  }

  async indexVault(vaultId: string, fromSeq: number): Promise<number> {
    const vault = await this.prisma.vault.findUnique({ where: { id: vaultId } });
    if (!vault) return fromSeq;
    let seq = fromSeq;
    let backoff = 500;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const feed = (await this.chain.view(vaultId, "get_changes_since", { seq, limit: 100 })) as {
          requests: OnChainRequest[];
          latest_seq: number;
        };
        for (const r of feed.requests) {
          await this.upsertRequest(vaultId, r);
        }
        seq = Number(feed.latest_seq);
        if (seq !== fromSeq) {
          await this.prisma.vault.update({ where: { id: vaultId }, data: { cursorSeq: BigInt(seq), health: "ok" } });
        }
        return seq;
      } catch (e) {
        this.logger.warn(`indexer ${vaultId} backoff attempt ${attempt}: ` + String(e));
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
      }
    }
    await this.prisma.vault.update({ where: { id: vaultId }, data: { health: "degraded" } }).catch(() => undefined);
    return seq;
  }

  async upsertRequest(vaultId: string, r: OnChainRequest): Promise<void> {
    const assetStr = typeof r.asset === "string" ? r.asset : `ft:${Object.values(r.asset)[0] ?? ""}`;
    const status = r.status.toUpperCase();
    const amount = BigInt(String(r.amount ?? "0"));
    const createdMs = Number(r.created_ns ?? 0) / 1e6;
    await this.prisma.paymentRequest.upsert({
      where: { vaultId_onchainId: { vaultId, onchainId: BigInt(r.id) } },
      create: {
        vaultId,
        onchainId: BigInt(r.id),
        agentPublicKey: r.agent_pk,
        clientRef: r.client_ref,
        asset: assetStr,
        amount: amount.toString(),
        chain: r.chain,
        address: r.address,
        destAsset: r.dest_asset ?? null,
        memo: r.memo ?? null,
        status: status as never,
        reason: r.reason ?? null,
        depositAddress: r.deposit_address ?? null,
        settlementRef: r.settlement_ref ?? null,
        lastChangeSeq: BigInt(String(r.last_change_seq ?? "0")),
        createdAt: new Date(createdMs),
        decidedAt: r.decided_ns ? new Date(Number(r.decided_ns) / 1e6) : null,
      },
      update: {
        status: status as never,
        reason: r.reason ?? null,
        depositAddress: r.deposit_address ?? null,
        settlementRef: r.settlement_ref ?? null,
        lastChangeSeq: BigInt(String(r.last_change_seq ?? "0")),
        decidedAt: r.decided_ns ? new Date(Number(r.decided_ns) / 1e6) : null,
      },
    });
    this.events.emit({
      vaultId,
      type: r.last_change_seq && r.status === "PENDING_APPROVAL" ? "request.updated" : "request.created",
      data: { id: r.id, status: r.status, client_ref: r.client_ref },
    });
    this.events.emit({ vaultId, type: "request.updated", data: { id: r.id, status: r.status } });
  }
}
