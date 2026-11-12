import { Worker } from "near-workspaces";
import { KeyPair } from "near-api-js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(__dirname, "../target/wasm32-unknown-unknown/release/agentvault.wasm");

const NEAR = 10n ** 24n;
const PER_TX = 5n * NEAR;
const DAILY = 20n * NEAR;

function policy() {
  return {
    limits: [
      { asset: "NEAR", per_tx_max: PER_TX.toString(), daily_max: DAILY.toString(), cosign_above: null },
    ],
    payees: [{ label: "alice", chain: "near", address: "alice", allowed_dest_assets: [] }],
    max_requests_per_hour: 10,
    freeze_after_violations: 3,
    expires_at_ns: null,
  };
}

describe("vault sandbox", () => {
  let worker;
  let vault;
  let owner;
  let alice;
  let agentKP;
  let agentAccount;

  beforeAll(async () => {
    worker = await Worker.init();
    const root = worker.rootAccount;
    owner = await root.createSubAccount("owner");
    alice = await root.createSubAccount("alice");
    vault = await root.devDeploy(wasmPath, { method: "new", args: { owner_id: owner.accountId } });
    agentKP = KeyPair.fromRandom("ed25519");
    await owner.call(vault, "add_agent", {
      public_key: agentKP.getPublicKey().toString(),
      name: "agent",
      policy: policy(),
      allowance_yocto: (5n * NEAR).toString(),
    });
    agentAccount = vault.getAccount(vault.accountId);
    await agentAccount.setKey(agentKP);
  });

  afterAll(async () => {
    await worker?.tearDown?.();
  });

  it("agent key can request_payment and gets COMPLETED", async () => {
    const before = Number((await alice.balance()).total);
    const result = await agentAccount.call(vault, "request_payment", {
      client_ref: "s1",
      asset: "NEAR",
      amount: (1n * NEAR).toString(),
      chain: "near",
      address: alice.accountId,
      dest_asset: "NEAR",
      memo: "hi",
    });
    const decision = typeof result === "string" ? JSON.parse(result) : result;
    expect(decision.Approved).toBeDefined();
    const req = await vault.view("get_request", { id: decision.Approved.request_id ?? decision.Approved?.request_id ?? 0 });
    expect(req.status).toBe("Completed");
    const after = Number((await alice.balance()).total);
    expect(after).toBeGreaterThan(before);
    void decision;
  });

  it("agent key cannot call withdraw_near", async () => {
    await expect(agentAccount.call(vault, "withdraw_near", { amount: "1", to: alice.accountId })).rejects.toThrow();
  });

  it("agent key cannot call approve_request", async () => {
    await expect(agentAccount.call(vault, "approve_request", { request_id: 0 })).rejects.toThrow();
  });

  it("agent key cannot call freeze_agent", async () => {
    await expect(
      agentAccount.call(vault, "freeze_agent", { public_key: agentKP.getPublicKey().toString() })
    ).rejects.toThrow();
  });

  it("agent key cannot call another contract", async () => {
    await expect(agentAccount.call(alice, "new", { owner_id: alice.accountId })).rejects.toThrow();
  });

  it("frozen agent gets AGENT_FROZEN", async () => {
    await owner.call(vault, "freeze_agent", { public_key: agentKP.getPublicKey().toString() });
    const result = await agentAccount.call(vault, "request_payment", {
      client_ref: "s2",
      asset: "NEAR",
      amount: (1n * NEAR).toString(),
      chain: "near",
      address: alice.accountId,
      dest_asset: "NEAR",
    });
    expect(JSON.stringify(result)).toContain("AGENT_FROZEN");
  });

  it("revoked key cannot sign", async () => {
    await owner.call(vault, "unfreeze_agent", { public_key: agentKP.getPublicKey().toString() });
    await owner.call(vault, "revoke_agent", { public_key: agentKP.getPublicKey().toString() });
    await expect(
      agentAccount.call(vault, "request_payment", {
        client_ref: "s3",
        asset: "NEAR",
        amount: (1n * NEAR).toString(),
        chain: "near",
        address: alice.accountId,
        dest_asset: "NEAR",
      })
    ).rejects.toThrow();
  });
});
