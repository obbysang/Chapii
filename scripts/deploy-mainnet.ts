import { OwnerClient } from "@agentvault/sdk";
import fs from "node:fs";

const ownerId = process.env.MAINNET_OWNER_ID ?? "agentvault-demo.near";
const ownerKey = process.env.MAINNET_PRIVATE_KEY ?? "";
if (!ownerKey) {
  console.log("MAINNET_PRIVATE_KEY not set. Human-required: create + fund mainnet accounts, supply via env only.");
  process.exit(0);
}
const VAULT = process.env.MAINNET_VAULT_ID ?? "vault.agentvault-demo.near";
const WASM = process.env.VAULT_WASM_PATH ?? "contracts/vault/target/wasm32-unknown-unknown/release/agentvault.wasm";
const owner = new OwnerClient({ network: "mainnet", accountId: ownerId, privateKey: ownerKey });
console.log("target vault:", VAULT);
const wasm = fs.readFileSync(WASM);
const r = await owner.createVault(VAULT, wasm as never);
console.log("mainnet vault created:", JSON.stringify(r));
