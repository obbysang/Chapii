import { JsonRpcProvider } from "@near-js/providers";
import { Account } from "@near-js/accounts";
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair, parseNearAmount } from "near-api-js";
import fs from "node:fs";
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
async function load(acct: string): Promise<Account> {
  const f = fs.readdirSync(`${process.env.HOME}/.near-credentials/testnet/${acct}`)[0];
  const cred = JSON.parse(fs.readFileSync(`${process.env.HOME}/.near-credentials/testnet/${acct}/${f}`, "utf8"));
  return new Account(acct, provider, new KeyPairSigner(KeyPair.fromString(cred.private_key)));
}
const src = await load("avfinal.testnet");
await src.transfer({ receiverId: "avharness.testnet", amount: parseNearAmount("9") });
console.log("sent 9 to owner");
