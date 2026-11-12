#!/usr/bin/env node
import 'dotenv/config';
import { parseUnits } from '@agentvault/shared';
import { LocalAgentRuntime, fetchJson } from './backend.js';
import { runScriptedAttacker, runScriptedGood } from './scripted.js';

const API_URL = (process.env.AGENTVAULT_API_URL?.trim() || 'http://localhost:8787').replace(
  /\/$/,
  '',
);

const USDC = 'ft:usdc.testnet';
const MERCHANT = 'merchant.testnet';
const BASE_PAYOUT = '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';

interface LocalVaultSummary {
  vaultId: string;
  label: string | null;
  ownerId: string | null;
  balances: Array<{ asset: string; amount: string }>;
}

interface NewAgent {
  publicKey: string;
  privateKey: string;
  name: string;
}

interface Health {
  status: string;
  mode: string;
  network: string;
  demoVaultId: string | null;
}

function demoPolicy() {
  return {
    limits: [
      {
        asset: 'NEAR',
        per_tx_max: parseUnits('5', 24).toString(),
        daily_max: parseUnits('20', 24).toString(),
        cosign_above: parseUnits('4', 24).toString(),
      },
      {
        asset: USDC,
        per_tx_max: parseUnits('25', 6).toString(),
        daily_max: parseUnits('100', 6).toString(),
        cosign_above: parseUnits('20', 6).toString(),
      },
    ],
    payees: [
      { label: 'Merchant', chain: 'near', address: MERCHANT, allowed_dest_assets: [] },
      {
        label: 'Base USDC payout',
        chain: 'base',
        address: BASE_PAYOUT,
        allowed_dest_assets: ['USDC'],
      },
      { label: 'Infrastructure', chain: 'near', address: 'infra.testnet', allowed_dest_assets: [] },
    ],
    max_requests_per_hour: 10,
    freeze_after_violations: 3,
    expires_at_ns: null,
  };
}

function line(): void {
  console.log('─'.repeat(74));
}

async function main(): Promise<void> {
  console.log('');
  line();
  console.log('AgentVault · end-to-end local demo');
  line();
  console.log(`API: ${API_URL}`);
  console.log('This demo creates a simulator vault. No chain calls and no funds move.');
  console.log('');

  let health: Health;
  try {
    health = await fetchJson<Health>(API_URL, '/health');
  } catch (error) {
    console.error(
      `Cannot reach the AgentVault API at ${API_URL}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    console.error('Start it with: docker compose up --build   (or pnpm --filter @agentvault/api dev)');
    process.exit(1);
    return;
  }
  if (health.mode !== 'local') {
    console.error(
      `This demo orchestrator only drives local simulator vaults (API mode is ${health.mode}).`,
    );
    console.error('Use pnpm agent:good / pnpm agent:attack with VAULT_ACCOUNT_ID + AGENT_PRIVATE_KEY for a real vault.');
    process.exit(1);
    return;
  }

  const label = process.env.DEMO_VAULT_LABEL?.trim() || `Demo run ${new Date().toLocaleTimeString()}`;
  const vault = await fetchJson<LocalVaultSummary>(API_URL, '/local/vaults', {
    method: 'POST',
    body: JSON.stringify({
      label,
      ownerId: process.env.DEMO_OWNER_ID?.trim() || 'demo-owner.testnet',
      fundingNear: '25',
      fundUsdc: '100',
    }),
  });
  console.log(`Vault: ${vault.vaultId}`);
  console.log(`Owner: ${vault.ownerId}`);
  console.log(
    `Balances: ${vault.balances
      .map((balance) => `${balance.asset}=${balance.amount}`)
      .join(' · ')}`,
  );
  console.log('');

  const goodAgent = await fetchJson<NewAgent>(
    API_URL,
    `/local/vaults/${encodeURIComponent(vault.vaultId)}/agents`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Demo Research Agent',
        policy: demoPolicy(),
        allowanceYocto: parseUnits('0.25', 24).toString(),
      }),
    },
  );
  const attackAgent = await fetchJson<NewAgent>(
    API_URL,
    `/local/vaults/${encodeURIComponent(vault.vaultId)}/agents`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Demo Compromised Agent',
        policy: demoPolicy(),
        allowanceYocto: parseUnits('0.25', 24).toString(),
      }),
    },
  );

  const good = new LocalAgentRuntime({
    mode: 'local-http',
    vaultId: vault.vaultId,
    agentPrivateKey: goodAgent.privateKey,
    network: 'testnet',
    apiUrl: API_URL,
  });
  const attacker = new LocalAgentRuntime({
    mode: 'local-http',
    vaultId: vault.vaultId,
    agentPrivateKey: attackAgent.privateKey,
    network: 'testnet',
    apiUrl: API_URL,
  });

  line();
  const goodSummary = await runScriptedGood(good);
  line();
  const attackSummary = await runScriptedAttacker(attacker);
  line();

  console.log('');
  console.log('Scoreboard');
  console.log(
    `  well-behaved agent: ${goodSummary.approved} approved, ${goodSummary.pending} awaiting owner co-sign`,
  );
  console.log(
    `  compromised agent:  ${attackSummary.blocked} blocked, ${attackSummary.duplicate} duplicate, ${attackSummary.approved} tiny probe approved`,
  );
  console.log('');
  const webUrl = (process.env.DEMO_WEB_URL?.trim() || 'http://localhost:8080').replace(/\/$/, '');
  console.log('Open the dashboard:');
  console.log(`  Console  ${webUrl}/app`);
  console.log(`  Demo     ${webUrl}/demo`);
  console.log(`  API      ${API_URL.replace(/\/$/, '')}`);
  console.log(`  Vault    ${vault.vaultId}`);
  console.log('');
  console.log(
    'The owner co-sign request is waiting in the Approvals page. The compromised agent hit the',
  );
  console.log('policy wall, and repeated violations tripped the auto-freeze breaker.');
  console.log('');

  if (goodSummary.errors > 0 || attackSummary.errors > 0) {
    console.error('Some requests ended in TX_ERROR; check the API logs.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    `[demo] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
});
