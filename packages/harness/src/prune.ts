import { OwnerClient } from "@agentvault/sdk";
import fs from "node:fs";
const VAULT = process.argv[2] ?? "avfinal.testnet";
const OWNER = "agentvault-hk1.testnet";
const ownerKey = JSON.parse(fs.readFileSync(process.env.HOME + "/.near-credentials/testnet/agentvault-hk1.testnet/ed25519_4nSbvBicHbXj2vF16HBxhotxE9bzrXgoqemP9FLuZhcy.json", "utf8")).private_key;
const owner = new OwnerClient({ network: "testnet", accountId: OWNER, privateKey: ownerKey });
const tx = await owner.call(VAULT, "prune_requests", { up_to_id: 100000, limit: 100 });
console.log("prune tx", tx);
