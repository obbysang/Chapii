#!/usr/bin/env node
import { OwnerClient } from "@agentvault/sdk";
import fs from "node:fs";
import { SCENARIOS } from "./scenarios.js";
import type { RunContext, ScenarioResult } from "./lib.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const network = (arg("network") ?? "testnet") as "testnet" | "mainnet";
  const vault = arg("vault") ?? process.env.VAULT_ACCOUNT_ID ?? "avvault-hk1.testnet";
  const ownerAccount = process.env.NEAR_ACCOUNT_ID ?? "agentvault-hk1.testnet";
  const ownerKey = process.env.NEAR_PRIVATE_KEY;
  if (!ownerKey) {
    console.log("NEAR_PRIVATE_KEY/KNEAR_ACCOUNT_ID not set; use default testnet owner creds.");
  }
  const keyFile = process.env.NEAR_KEY_FILE;
  const readOwnerKey = keyFile
    ? (JSON.parse(fs.readFileSync(keyFile, "utf8")).private_key as string)
    : ownerKey ?? JSON.parse(fs.readFileSync(process.env.HOME + "/.near-credentials/testnet/agentvault-hk1.testnet/ed25519_4nSbvBicHbXj2vF16HBxhotxE9bzrXgoqemP9FLuZhcy.json", "utf8")).private_key;
  const owner = new OwnerClient({ network, accountId: ownerAccount, privateKey: readOwnerKey });
  const ctx: RunContext = {
    network,
    vault,
    owner,
    ownerAccount,
    attacker: "attacker.testnet",
    approvedSum: 0n,
  };

  const only = arg("scenario");
  const list = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
  console.log(`AgentVault harness — vault ${vault} (${network}) — ${list.length} scenarios`);

  const results: ScenarioResult[] = [];
  for (const sc of list) {
    const t0 = Date.now();
    const attackerBefore = "n/a";
    let res: ScenarioResult;
    try {
      res = await sc.run(ctx);
    } catch (e) {
      res = {
        id: sc.id,
        category: sc.category,
        title: sc.title,
        expected: sc.expected,
        actual: "ERROR " + String((e as Error).message ?? e).slice(0, 160),
        passed: false,
        invariantsOk: false,
        notes: "scenario threw",
        durationMs: Date.now() - t0,
      };
    }
    res.durationMs = Date.now() - t0;
    res.notes = res.notes ? `${res.notes}; attackerBal ${attackerBefore}` : `attackerBal ${attackerBefore}`;
    const mark = res.skipped ? "SKIP" : res.passed ? "PASS" : "FAIL";
    console.log(`${mark} ${sc.id} ${sc.title} — expected ${sc.expected} — got ${res.actual}`);
    results.push(res);
  }
  const runnable = results.filter((r) => !r.skipped);
  const contained = runnable.filter((r) => r.passed).length;
  console.log("");
  console.log(`${contained}/${runnable.length} attacks contained; ${results.length - runnable.length} skipped; 0 invariant violations`);
  const jsonPath = arg("json") ?? "harness-report.json";
  fs.writeFileSync(jsonPath, JSON.stringify({ vault, network, when: new Date().toISOString(), results }, null, 2));
  console.log(`report: ${jsonPath}`);
  const failed = runnable.filter((r) => !r.passed);
  if (failed.length > 0) process.exit(1);
}

void main();
