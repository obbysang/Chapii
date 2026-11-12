import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  async health(): Promise<{
    ok: boolean;
    chain: string;
    db: string;
    indexerLagMs: number;
  }> {
    let db = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "down";
    }
    let chain = "ok";
    try {
      const rpc = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "status", params: [] }),
      });
      if (!res.ok) chain = "down";
    } catch {
      chain = "down";
    }
    return { ok: chain === "ok" && db === "ok", chain, db, indexerLagMs: 0 };
  }
}
