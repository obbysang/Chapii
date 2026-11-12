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
try {
  const t = await vaultAcct.transfer({ receiverId: "agentvault-hk1.testnet", amount: 1n });
  console.log("transfer 1 yocto OK", t.transaction.hash);
} catch (e) {
  console.log("transfer 1 yocto FAIL:", JSON.stringify(e).slice(0, 500));
}
