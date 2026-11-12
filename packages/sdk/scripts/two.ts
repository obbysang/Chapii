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
// view keys
const keys = await provider.query({ request_type: "view_access_key_list", account_id: VAULT, finality: "final" }) as { keys: Array<{ public_key: string; permission: unknown }> };
console.log("num keys:", keys.keys.length);
console.log(keys.keys.map((k) => k.permission).slice(0, 3));
// try simple transfer signed by vault's own key
await vaultAcct.transfer({ receiverId: "agentvault-hk1.testnet", amount: 100000000000000000000000n })
  .then((t) => console.log("transfer 0.1 OK", t.transaction.hash))
  .catch((e) => console.log("transfer 0.1 FAIL", String(e.message ?? e).slice(0, 160)));
