import { AgentVaultClient } from "@agentvault/sdk";

const vaultAccountId = process.env.VAULT_ACCOUNT_ID ?? "avfinal.testnet";
const agentPrivateKey = process.env.AGENT_PRIVATE_KEY ?? "";
const payee = process.env.DEMO_PAYEE ?? "avpayee.testnet";

if (!agentPrivateKey) {
  console.log("AGENT_PRIVATE_KEY not set. Create an agent first (wizard/demo) and set VAULT_ACCOUNT_ID + AGENT_PRIVATE_KEY.");
  process.exit(0);
}

const c = new AgentVaultClient({ network: "testnet", vaultAccountId, agentPrivateKey });
const budget = (await c.getBudget()) as { per_asset: Array<{ asset: string; remaining: string }>; rate_remaining: number };
console.log("budget:", JSON.stringify(budget));

const stamps = Date.now().toString(36);
const payments = [
  { client_ref: `good-${stamps}-1`, asset: "NEAR", amount: "100000000000000000000000", chain: "near", address: payee, memo: "api invoice" },
  { client_ref: `good-${stamps}-2`, asset: "NEAR", amount: "200000000000000000000000", chain: "near", address: payee, memo: "compute" },
  { client_ref: `good-${stamps}-3`, asset: "NEAR", amount: "2500000000000000000000000", chain: "near", address: payee, memo: "large: may need co-sign" },
];
let approved = 0;
for (const p of payments) {
  const r = await c.requestPayment(p as never);
  console.log(r.decision, "reason" in r ? r.reason : "", "txHash" in r && r.txHash ? r.txHash : "");
  if (r.decision === "APPROVED") approved++;
}
console.log(`Good agent: ${approved}/${payments.length} payments approved`);
