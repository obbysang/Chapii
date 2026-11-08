import { AgentVaultClient, OwnerClient } from "../src/index.ts";
import { KeyPair } from "@near-js/crypto";
import fs from "node:fs";
import path from "node:path";

const NETWORK = "testnet" as const;
const OWNER = process.env.NEAR_ACCOUNT_ID ?? "agentvault-hk1.testnet";
const VAULT = process.env.VAULT_ACCOUNT_ID ?? "avvault-hk1.testnet";
const OWNER_KEY_FILE =
  "/home/micro/.near-credentials/testnet/agentvault-hk1.testnet/ed25519_4nSbvBicHbXj2vF16HBxhotxE9bzrXgoqemP9FLuZhcy.json";
const ownerKey = JSON.parse(fs.readFileSync(OWNER_KEY_FILE, "utf8")).private_key as string;

const fsm = path.join(process.cwd(), "..", "..");
void fsm;

const owner = new OwnerClient({ network: NETWORK, accountId: OWNER, privateKey: ownerKey });

const policy = {
  limits: [{ asset: "NEAR", per_tx_max: "1000000000000000000000000", daily_max: "2000000000000000000000000", cosign_above: null }],
  payees: [{ label: "owner", chain: "near", address: OWNER, allowed_dest_assets: [] }],
  max_requests_per_hour: 10,
  freeze_after_violations: 3,
  expires_at_ns: null,
};

const agentKP = KeyPair.fromRandom("ed25519");
const agentPrivateKey = agentKP.secretKey.toString();
console.log("agent pk:", agentKP.getPublicKey().toString());

await owner.addAgent(VAULT, {
  agentPrivateKey,
  name: "gate3",
  policy,
  allowanceYocto: "5000000000000000000000000",
});
console.log("Agent added");

const agent = new AgentVaultClient({ network: NETWORK, vaultAccountId: VAULT, agentPrivateKey });

const good = await agent.requestPayment({
  client_ref: `g3-${Date.now()}-a`,
  asset: "NEAR",
  amount: "500000000000000000000000",
  chain: "near",
  address: OWNER,
  dest_asset: "NEAR",
});
console.log("APPROVED case:", JSON.stringify(good));
if (good.decision === "APPROVED") {
  const term = await agent.waitForTerminal(good.requestId, { timeoutMs: 20000 });
  console.log("terminal status:", term.status);
}

const bad = await agent.requestPayment({
  client_ref: `g3-${Date.now()}-b`,
  asset: "NEAR",
  amount: "100000000000000000000000",
  chain: "near",
  address: "attacker.testnet",
  dest_asset: "NEAR",
});
console.log("REJECTED case:", JSON.stringify(bad));
