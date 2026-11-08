import { OwnerClient, AgentVaultClient } from "@agentvault/sdk";
import { KeyPair } from "near-api-js";
import fs from "node:fs";
const VAULT = "avfinal.testnet";
const OWNER = "agentvault-hk1.testnet";
const ownerKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.near-credentials/testnet/agentvault-hk1.testnet/ed25519_4nSbvBicHbXj2vF16HBxhotxE9bzrXgoqemP9FLuZhcy.json", "utf8")).private_key;
const owner = new OwnerClient({ network: "testnet", accountId: OWNER, privateKey: ownerKey });
const policy = {
  limits: [{ asset: "NEAR", per_tx_max: "2000000000000000000000000", daily_max: "5000000000000000000000000", cosign_above: null }],
  payees: [{ label: "alice", chain: "near", address: "avpayee.testnet", allowed_dest_assets: [] }],
  max_requests_per_hour: 10,
  freeze_after_violations: 3,
  expires_at_ns: null,
};
const kp = KeyPair.fromRandom("ed25519");
const { publicKey } = await owner.addAgent(VAULT, { agentPrivateKey: kp.toString(), name: "mcp", policy, allowanceYocto: "5000000000000000000000000" });
console.log("AGENT_PRIVATE_KEY=" + kp.toString());
console.log("AGENT_PK=" + publicKey);
fs.writeFileSync("/tmp/mcp-agent-key.txt", kp.toString());
