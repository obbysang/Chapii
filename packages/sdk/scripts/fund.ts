import { JsonRpcProvider } from "@near-js/providers";
import { Account } from "@near-js/accounts";
import { KeyPairSigner } from "@near-js/signers";
import { KeyPair, parseNearAmount } from "near-api-js";
import fs from "node:fs";

const TARGET = "avfinal.testnet";
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.fastnear.com" });
async function load(acct: string): Promise<Account> {
  const f = fs.readdirSync(`${process.env.HOME}/.near-credentials/testnet/${acct}`)[0];
  const cred = JSON.parse(fs.readFileSync(`${process.env.HOME}/.near-credentials/testnet/${acct}/${f}`, "utf8"));
  return new Account(acct, provider, new KeyPairSigner(KeyPair.fromString(cred.private_key)));
}
for (const src of ["avpayee.testnet", "agentvault-hk1.testnet"]) {
  try {
    const a = await load(src);
    const keep = parseNearAmount("0.2");
    const bal = BigInt((await provider.query({ request_type: "view_account", account_id: src, finality: "final" }) as unknown as { amount: string }).amount);
    const send = bal - BigInt(keep);
    if (send > 0n) {
      await a.transfer({ receiverId: TARGET, amount: send });
      console.log("sent max from", src);
    }
  } catch (e) {
    console.log("skip", src, String((e as Error).message ?? e).slice(0, 80));
  }
}
