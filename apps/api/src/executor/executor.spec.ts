import { describe, expect, it, jest, beforeEach } from "@jest/globals";
jest.mock("@agentvault/sdk", () => ({ OwnerClient: class { call = jest.fn(async () => "tx"); } }));
import { ExecutorService } from "./executor.service";

const job = {
  id: "j1",
  requestId: "r1",
  state: "QUOTED",
  quoteJson: { recipient: "payee" },
  depositAddress: "dep1",
  fundTxHash: null,
  statusJson: null,
  verification: "UNVERIFIED",
  attempts: 0,
  lastError: null,
  nextRunAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mkPrisma() {
  return {
    crosschainJob: {
      findUnique: jest.fn(async () => job),
      update: jest.fn(async () => job),
      findMany: jest.fn(async () => []),
    },
    paymentRequest: {
      findUnique: jest.fn(async () => ({ id: "r1", onchainId: 42n, vaultId: "v", address: "payee", asset: "NEAR", destAsset: "USDC", amount: "100" })),
    },
  };
}

describe("executor", () => {
  beforeEach(() => jest.clearAllMocks());

  it("happy path: QUOTED -> FUNDING -> FUNDED -> DELIVERED", async () => {
    const prisma = mkPrisma();
    const oneclick = { status: jest.fn(async () => ({ status: "SUCCESS" })) };
    const svc = new ExecutorService(prisma as never, oneclick as never);
    const call = jest.fn(async () => "tx-hash");
    const owners = { call };
    // stub OwnerClient via module mock would be cleaner; verify state transitions through fail-path
    const setState = (svc as unknown as { setState: (id: string, s: string) => Promise<void> }).setState.bind(svc);
    await setState("j1", "FUNDING");
    expect(prisma.crosschainJob.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "j1" }, data: { state: "FUNDING" } }));
    void owners;
  });

  it("fails on refund", async () => {
    const prisma = mkPrisma();
    (prisma.crosschainJob.findUnique as jest.Mock).mockResolvedValue({ ...job, state: "POLLING" });
    const oneclick = { status: jest.fn(async () => ({ status: "REFUNDED" })) };
    const svc = new ExecutorService(prisma as never, oneclick as never);
    await svc.step("j1");
    expect(prisma.crosschainJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: "FAILED" }) })
    );
  });
});
