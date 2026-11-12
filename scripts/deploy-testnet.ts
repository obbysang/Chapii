#!/usr/bin/env tsx
/**
 * Deploy an AgentVault contract to NEAR testnet (or mainnet) and optionally
 * register the first agent.
 *
 * Required env:
 *   NEAR_ACCOUNT_ID        owner/deployer account (must hold NEAR)
 *   NEAR_PRIVATE_KEY       owner/deployer private key
 *   VAULT_ACCOUNT_ID       new sub-account, e.g. demo.agentvault.testnet
 *
 * Optional:
 *   NEAR_NETWORK           testnet (default) | mainnet
 *   NEAR_RPC_URL           custom RPC
 *   VAULT_WASM             default build/contracts/vault.wasm
 *   VAULT_FUNDING_NEAR     default 5
 *   VAULT_DEV_MODE         true keeps the owner full-access key (default true)
 *   AGENT_PUBLIC_KEY       register this agent key
 *   GENERATE_AGENT_KEY     true generates a keypair and prints it once
 *   AGENT_NAME             default "Demo Research Agent"
 *   AGENT_ALLOWANCE_NEAR   default 0.25
 *   AGENT_POLICY_FILE      JSON file overriding the default demo policy
 *
 * Example:
 *   NEAR_ACCOUNT_ID=you.testnet NEAR_PRIVATE_KEY=ed25519:... \
 *   VAULT_ACCOUNT_ID=demo.you.testnet GENERATE_AGENT_KEY=true \
 *   pnpm deploy:testnet
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OwnerClient, generateAgentKey } from '../packages/sdk/src/index.js';
import { parseUnits, type Policy } from '../packages/shared/src/index.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function flag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function defaultPolicy(): Policy {
  return {
    limits: [
      {
        asset: 'NEAR',
        per_tx_max: parseUnits('5', 24).toString(),
        daily_max: parseUnits('20', 24).toString(),
        cosign_above: parseUnits('4', 24).toString(),
      },
      {
        asset: 'ft:usdc.testnet',
        per_tx_max: parseUnits('25', 6).toString(),
        daily_max: parseUnits('100', 6).toString(),
        cosign_above: parseUnits('20', 6).toString(),
      },
    ],
    payees: [
      { label: 'Merchant', chain: 'near', address: 'merchant.testnet', allowed_dest_assets: [] },
      {
        label: 'Base USDC payout',
        chain: 'base',
        address: '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd',
        allowed_dest_assets: ['USDC'],
      },
      {
        label: 'Infrastructure',
        chain: 'near',
        address: 'infra.testnet',
        allowed_dest_assets: [],
      },
    ],
    max_requests_per_hour: 12,
    freeze_after_violations: 3,
    expires_at_ns: null,
  };
}

async function main(): Promise<void> {
  const ownerId = required('NEAR_ACCOUNT_ID');
  const privateKey = required('NEAR_PRIVATE_KEY');
  const vaultId = required('VAULT_ACCOUNT_ID');
  const network = (process.env.NEAR_NETWORK?.trim() || 'testnet') as 'testnet' | 'mainnet';
  const rpcUrl = process.env.NEAR_RPC_URL?.trim() || undefined;
  const wasmPath = resolve(
    process.env.VAULT_WASM?.trim() || 'build/contracts/vault.wasm',
  );
  const fundingNear = process.env.VAULT_FUNDING_NEAR?.trim() || '5';
  const devMode = flag('VAULT_DEV_MODE', true);

  if (network !== 'testnet' && network !== 'mainnet') {
    console.error('NEAR_NETWORK must be testnet or mainnet');
    process.exit(1);
  }
  if (!existsSync(wasmPath)) {
    console.error(`Contract wasm not found at ${wasmPath}`);
    console.error('Build it first: pnpm contract:build');
    process.exit(1);
  }
  if (!vaultId.endsWith(`.${ownerId}`) && vaultId !== ownerId) {
    console.error(`VAULT_ACCOUNT_ID must be a sub-account of ${ownerId} (got ${vaultId})`);
    process.exit(1);
  }
  if (network === 'mainnet' && flag('HARNESS_ENABLED', false)) {
    console.error('HARNESS_ENABLED must be false on mainnet');
    process.exit(1);
  }

  const owner = new OwnerClient({ network, rpcUrl, accountId: ownerId, privateKey });
  const wasm = new Uint8Array(readFileSync(wasmPath));

  console.log(`Network:  ${network}`);
  console.log(`Owner:    ${ownerId}`);
  console.log(`Vault:    ${vaultId}`);
  console.log(`Wasm:     ${wasmPath} (${wasm.byteLength} bytes)`);
  console.log(`Dev mode: ${devMode}${devMode ? '' : ' (vault will be locked)'}`);

  const balance = await owner.getBalance();
  console.log(`Owner balance: ${balance} yoctoNEAR`);
  const fundingYocto = parseUnits(fundingNear, 24);
  if (balance < fundingYocto + parseUnits('1', 24)) {
    console.error('Owner balance is too low for the vault funding plus fees.');
    console.error('Fund it from https://helper.testnet.near.org/');
    process.exit(1);
  }

  console.log('\nDeploying vault...');
  const created = await owner.createVault({
    vaultId,
    ownerId,
    wasm,
    fundingYocto,
    devMode,
  });
  console.log(`  tx: ${created.txHash ?? '(unknown)'}`);

  // Give the RPC a moment to expose the new state.
  await new Promise((r) => setTimeout(r, 1500));
  const onchainOwner = await owner.getOwner(vaultId);
  if (onchainOwner !== ownerId) {
    console.error(`Owner mismatch: expected ${ownerId}, got ${onchainOwner}`);
    process.exit(1);
  }
  console.log(`  verified owner: ${onchainOwner}`);

  let agentPublicKey = process.env.AGENT_PUBLIC_KEY?.trim();
  let generatedPrivateKey: string | null = null;
  if (!agentPublicKey && flag('GENERATE_AGENT_KEY', false)) {
    const generated = generateAgentKey();
    agentPublicKey = generated.publicKey;
    generatedPrivateKey = generated.privateKey;
  }

  if (agentPublicKey) {
    const policy = process.env.AGENT_POLICY_FILE?.trim()
      ? (JSON.parse(readFileSync(resolve(process.env.AGENT_POLICY_FILE.trim()), 'utf8')) as Policy)
      : defaultPolicy();
    const name = process.env.AGENT_NAME?.trim() || 'Demo Research Agent';
    const allowance = parseUnits(process.env.AGENT_ALLOWANCE_NEAR?.trim() || '0.25', 24);
    console.log(`\nAdding agent ${name} (${agentPublicKey})...`);
    const added = await owner.addAgent(vaultId, {
      publicKey: agentPublicKey,
      name,
      policy,
      allowanceYocto: allowance.toString(),
    });
    console.log(`  tx: ${added.txHash ?? '(unknown)'}`);
  }

  if (!devMode) {
    console.log('\nVault is locked (no full-access keys). Owner methods are still signed by the owner account.');
  }

  console.log('\nRegister the vault with the API:');
  console.log(
    `  curl -X POST http://localhost:8787/vaults -H 'content-type: application/json' -d '{"vaultId":"${vaultId}"}'`,
  );

  if (generatedPrivateKey) {
    console.log('\nAgent key (shown once, store it securely):');
    console.log(`  VAULT_ACCOUNT_ID=${vaultId}`);
    console.log(`  AGENT_PRIVATE_KEY=${generatedPrivateKey}`);
  }
  console.log('\nExplorer:');
  console.log(`  https://explorer.${network}.near.org/accounts/${vaultId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
