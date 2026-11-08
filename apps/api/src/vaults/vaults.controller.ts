import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { EventsService } from "../events.service";
import { PrismaService } from "../prisma.service";
import { ChainClient } from "../chain/chain.client";
import { IndexerService } from "./indexer.service";

const RegisterVault = z.object({ vaultId: z.string().min(3) });

@Controller("vaults")
export class VaultsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainClient,
    private readonly events: EventsService,
    private readonly indexer: IndexerService
  ) {}

  @Post()
  async register(@Body() body: unknown): Promise<{ vaultId: string }> {
    const { vaultId } = RegisterVault.parse(body);
    const owner = (await this.chain.view(vaultId, "get_owner", {})) as string;
    if (!owner) throw new BadRequestException({ code: "NOT_A_VAULT", message: "get_owner failed" });
    const network = (process.env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet") as "testnet" | "mainnet";
    await this.prisma.vault.upsert({
      where: { id: vaultId },
      create: { id: vaultId, network, ownerAccountId: owner },
      update: { ownerAccountId: owner },
    });
    void this.indexer.indexVault(vaultId, 0);
    return { vaultId };
  }

  @Get()
  async list(@Query("owner") owner?: string): Promise<unknown[]> {
    return owner ? this.prisma.vault.findMany({ where: { ownerAccountId: owner } }) : this.prisma.vault.findMany();
  }

  @Get(":id/summary")
  async summary(@Param("id") id: string): Promise<unknown> {
    const vault = await this.prisma.vault.findUnique({ where: { id } });
    if (!vault) throw new NotFoundException({ code: "VAULT_NOT_FOUND", message: "vault not registered" });
    const [requests, agents, storage] = await Promise.all([
      this.chain.view(id, "get_requests", { from_id: 0, limit: 100, reverse: true }).catch(() => []),
      this.chain.view(id, "get_agents", { from_index: 0, limit: 100 }).catch(() => []),
      this.chain.view(id, "get_storage_info", {}).catch(() => null),
    ]);
    const reqs = (requests ?? []) as Array<{ status: string; amount: string; asset: string }>;
    let approved = 0;
    let rejected = 0;
    let spent = 0n;
    for (const r of reqs) {
      if (r.status === "COMPLETED" || r.status === "APPROVED") {
        approved++;
        spent += BigInt(String(r.amount ?? "0"));
      } else if (r.status === "REJECTED" || r.status === "FAILED" || r.status === "REJECTED_BY_OWNER" || r.status === "EXPIRED") {
        rejected++;
      }
    }
    return this.clean({ vaultId: id, owner: vault.ownerAccountId, requests: reqs.length, approved, rejected, spent: spent.toString(), agents, storage });
  }

  @Get(":id/agents")
  async agents(@Param("id") id: string): Promise<unknown> {
    return this.chain.view(id, "get_agents", { from_index: 0, limit: 100 });
  }

  private clean<T extends object>(v: T): T {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val?.toFixed ? val.toFixed(0) : val))) as T;
  }

  @Get(":id/requests")
  async requests(
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string
  ): Promise<{ rows: unknown[] }> {
    const rows = await this.prisma.paymentRequest.findMany({
      where: {
        vaultId: id,
        ...(status ? { status: status.toUpperCase() as never } : {}),
        ...(cursor ? { onchainId: { lt: BigInt(cursor) } } : {}),
      },
      orderBy: { onchainId: "desc" },
      take: Math.min(Number(limit ?? 50), 200),
    });
    return this.clean({ rows });
  }

  @Get(":id/requests/:requestId")
  async request(@Param("id") id: string, @Param("requestId") requestId: string): Promise<unknown> {
    const row = await this.prisma.paymentRequest.findUnique({
      where: { vaultId_onchainId: { vaultId: id, onchainId: BigInt(requestId) } },
    });
    if (!row) throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "request not found" });
    return this.clean(row);
  }

  @Get(":id/stream")
  stream(@Param("id") id: string, @Res() res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const unsub = this.events.subscribe(id, (line: string) => res.write(line));
    res.on("close", unsub);
  }
}
