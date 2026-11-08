import { OwnerClient, AgentVaultClient } from "@agentvault/sdk";
import { KeyPair } from "near-api-js";
import fs from "node:fs";
const VAULT = "avharness.testnet";
const OWNER = "agentvault-hk1.testnet";
const ownerKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.near-credentials/testnet/agentvault-hk1.testnet/ed25519_4nSbvBicHbXj2vF16HBxhotxE9bzrXgoqemP9FLuZhcy.json", "utf8")).private_key;
const owner = new OwnerClient({ network: "testnet", accountId: OWNER, privateKey: ownerKey });
const policy = {
  limits: [{ asset: "NEAR", per_tx_max: "1000000000000000000000000", daily_max: "11000000000000000000000000", cosign_above: null }],
  payees: [{ label: "alice", chain: "eth", address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", allowed_dest_assets: [] }],
  max_requests_per_hour: 10,
  freeze_after_violations: 0,
  expires_at_ns: null,
};
const kp = KeyPair.fromRandom("ed25519");
const { publicKey } = await owner.addAgent(VAULT, { agentPrivateKey: kp.toString(), name: "dbg", policy, allowanceYocto: "5000000000000000000000000" });
console.log("added");
await new Promise((r) => setTimeout(r, 700));
const c = new AgentVaultClient({ network: "testnet", vaultAccountId: VAULT, agentPrivateKey: kp.toString() });
for (let i = 0; i < 15; i++) {
  const d = await c.requestPayment({ client_ref: `dbg-${Date.now().toString(36)}-${i}`, asset: "NEAR", amount: "100000000000000000000000", chain: "eth", address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", dest_asset: "NEAR" });
  console.log(i, JSON.stringify(d));
  await new Promise((r) => setTimeout(r, 400));
}
await owner.revokeAgent(VAULT, publicKey);
