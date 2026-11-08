import { JsonRpcProvider } from "@near-js/providers";
import { Account } from "@near-js/accounts";
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair } from "@near-js/crypto";
import fs from "node:fs";
const VAULT = "avvault-hk1.testnet";
const vFile = fs.readdirSync(`${process.env.HOME}/.near-credentials/testnet/${VAULT}`)[0];
const vcred = JSON.parse(fs.readFileSync(`${process.env.HOME}/.near-credentials/testnet/${VAULT}/${vFile}`, "utf8"));
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
const vaultAcct = new Account(VAULT, provider, new KeyPairSigner(KeyPair.fromString(vcred.private_key as never)));
let hash = "";
try {
  const t = await vaultAcct.transfer({ receiverId: "agentvault-hk1.testnet", amount: 100000000000000000000000n });
  console.log("transfer 0.1 OK", t.transaction.hash);
} catch (e) {
  console.log("FAIL raw:", JSON.stringify(e).slice(0, 800));
}
