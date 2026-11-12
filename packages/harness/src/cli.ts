#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalHarnessBackend } from './backend-local.js';
import { NearHarnessBackend } from './backend-near.js';
import { formatTable, runHarness } from './runner.js';
import type { HarnessBackend, HarnessReport } from './types.js';

interface CliOptions {
  network: 'local' | 'testnet' | 'mainnet';
  vault?: string;
  json?: string;
  llm: boolean;
  only?: string[];
  quiet: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { network: 'local', llm: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--network') {
      const value = argv[i + 1];
      if (value !== 'local' && value !== 'testnet' && value !== 'mainnet') {
        throw new Error('--network must be local, testnet or mainnet');
      }
      opts.network = value;
      i += 1;
    } else if (arg === '--vault') {
      opts.vault = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      opts.json = argv[i + 1];
      i += 1;
    } else if (arg === '--llm') {
      opts.llm = true;
    } else if (arg === '--only') {
      opts.only = (argv[i + 1] ?? '').split(',').filter(Boolean);
      i += 1;
    } else if (arg === '--quiet') {
      opts.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`AgentVault red-team harness

Usage:
  pnpm harness --network local [--json report.json] [--llm]
  pnpm harness --network testnet --vault <vault.testnet> [--json report.json]

Environment for testnet/mainnet:
  NEAR_ACCOUNT_ID       owner/funder account id
  NEAR_PRIVATE_KEY      owner/funder private key (never commit it)
  VAULT_ACCOUNT_ID      vault account id (or use --vault)
  NEAR_RPC_URL          optional RPC override

The local mode uses a deterministic emulator of the contract policy and needs
no keys or network. Testnet mode exercises the real protocol and contract.
`);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  let backend: HarnessBackend;

  if (opts.network === 'local') {
    backend = new LocalHarnessBackend({ vaultId: opts.vault ?? 'harness-vault.testnet' });
  } else {
    const ownerId = process.env.NEAR_ACCOUNT_ID;
    const privateKey = process.env.NEAR_PRIVATE_KEY;
    const vaultId = opts.vault ?? process.env.VAULT_ACCOUNT_ID;
    if (!ownerId || !privateKey || !vaultId) {
      throw new Error(
        'testnet mode needs NEAR_ACCOUNT_ID, NEAR_PRIVATE_KEY and VAULT_ACCOUNT_ID (or --vault)',
      );
    }
    backend = new NearHarnessBackend({
      network: opts.network,
      rpcUrl: process.env.NEAR_RPC_URL,
      ownerAccountId: ownerId,
      ownerPrivateKey: privateKey,
      vaultId,
    });
  }

  const report: HarnessReport = await runHarness({
    backend,
    llm: opts.llm,
    only: opts.only,
    onProgress: opts.quiet
      ? undefined
      : (result, index, total) => {
          const state = result.skipped ? 'skip' : result.passed ? 'pass' : 'FAIL';
          process.stdout.write(`[${index + 1}/${total}] ${result.scenarioId} ${state}\n`);
        },
  });

  if (!opts.quiet) {
    console.log(formatTable(report));
  }
  if (opts.json) {
    const path = resolve(opts.json);
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Report written to ${path}`);
  }
  await backend.close?.();
  const ok =
    report.invariantsOk &&
    report.attacksContained === report.attacks &&
    report.controlsPassed === report.controls;
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
