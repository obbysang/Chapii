import { EventsService } from "../events.service";

jest.mock("../prisma.service", () => ({}));
jest.mock("../chain/chain.client", () => ({}));

import { IndexerService } from "./indexer.service";

function mockPrisma() {
  const rows = new Map<string, unknown>();
  const idOf = (where: { vaultId: string; onchainId: bigint }) => `${where.vaultId}|${where.onchainId}`;
  return {
    rows,
    vault: {
      findUnique: jest.fn(async () => ({ id: "v", cursorSeq: 0n, health: "ok" })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
    },
    paymentRequest: {
      upsert: jest.fn(async (args: { where: { vaultId_onchainId: { vaultId: string; onchainId: bigint } }; create: unknown; update: unknown }) => {
        const key = idOf(args.where.vaultId_onchainId);
        const exists = rows.has(key);
        rows.set(key, exists ? { ...rows.get(key), ...args.update } : args.create);
        return rows.get(key);
      }),
    },
  };
}

const sampleRequest = {
  id: 7,
  agent_pk: "ed25519:abc",
  client_ref: "c7",
  asset: "NEAR",
  amount: "1000",
  chain: "near",
  address: "bob.testnet",
  dest_asset: null,
  memo: null,
  status: "COMPLETED",
  reason: null,
  deposit_address: null,
  settlement_ref: null,
  created_ns: 1000000000000,
  decided_ns: 1000000001000,
  last_change_seq: 3,
};

describe("indexer", () => {
  it("upserts are idempotent (same row, no duplicates)", async () => {
    const prisma = mockPrisma();
    const svc = new IndexerService(prisma as never, { view: jest.fn() } as never, new EventsService());
    await svc.upsertRequest("v", sampleRequest as never);
    await svc.upsertRequest("v", sampleRequest as never);
    expect(prisma.rows.size).toBe(1);
  });

  it("emits request events on SSE bus", async () => {
    const prisma = mockPrisma();
    const events = new EventsService();
    const received: string[] = [];
    const unsub = events.subscribe("v", (line: string) => received.push(line));
    const svc = new IndexerService(prisma as never, { view: jest.fn() } as never, events);
    await svc.upsertRequest("v", sampleRequest as never);
    expect(received.join("")).toContain("request.updated");
    unsub();
  });
});
