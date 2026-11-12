#!/usr/bin/env tsx
/**
 * Lock a vault by deleting the owner's full-access key from it.
 *
 * After this, the vault account has no keys of its own. Agents can only act
 * through their function-call keys, and the owner account still signs owner
 * methods from its own account (predecessor = owner).
 *
 * Required env:
 *   NEAR_ACCOUNT_ID     owner account
 *   NEAR_PRIVATE_KEY    owner private key (the key to delete from the vault)
 *   VAULT_ACCOUNT_ID    vault account
 *
 * Optional:
 *   NEAR_NETWORK        testnet (default) | mainnet
 *   NEAR_RPC_URL        custom RPC
 */
import 'dotenv/config';
import { OwnerClient, publicKeyOf } from '../packages/sdk/src/index.js';
import { NETWORKS } from '../packages/shared/src/index.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

interface AccessKeyInfo {
  public_key: string;
  access_key: {
    permission:
      | 'FullAccess'
      | { FunctionCall: { receiver_id: string; method_names: string[]; allowance: string | null } };
  };
}

async function listKeys(rpcUrl: string, accountId: string): Promise<AccessKeyInfo[]> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'agentvault-lock',
      method: 'query',
      params: {
        request_type: 'view_access_key_list',
        finality: 'final',
        account_id: accountId,
      },
    }),
  });
  const body = (await response.json()) as {
    result?: { keys: AccessKeyInfo[] };
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message ?? 'RPC error');
  return body.result?.keys ?? [];
}

async function main(): Promise<void> {
  const ownerId = required('NEAR_ACCOUNT_ID');
  const privateKey = required('NEAR_PRIVATE_KEY');
  const vaultId = required('VAULT_ACCOUNT_ID');
  const network = (process.env.NEAR_NETWORK?.trim() || 'testnet') as 'testnet' | 'mainnet';
  const rpcUrl = process.env.NEAR_RPC_URL?.trim() || NETWORKS[network].rpcUrl;
  const ownerPublicKey = publicKeyOf(privateKey);

  console.log(`Network: ${network}`);
  console.log(`Vault:   ${vaultId}`);
  console.log(`Owner:   ${ownerId}`);
  console.log(`Key:     ${ownerPublicKey}`);

  const before = await listKeys(rpcUrl, vaultId);
  console.log(`\nAccess keys before (${before.length}):`);
  for (const key of before) {
    const permission =
      key.access_key.permission === 'FullAccess'
        ? 'FullAccess'
        : `FunctionCall(${key.access_key.permission.FunctionCall.receiver_id})`;
    console.log(`  ${key.public_key}  ${permission}`);
  }

  const hasOwnerKey = before.some((key) => key.public_key === ownerPublicKey);
  if (!hasOwnerKey) {
    console.log('\nThe owner key is not present on the vault; nothing to delete.');
  } else {
    const owner = new OwnerClient({ network, rpcUrl, accountId: ownerId, privateKey });
    console.log('\nDeleting owner full-access key from the vault...');
    const result = await owner.deleteKey(vaultId, ownerPublicKey);
    console.log(`  tx: ${result.txHash ?? '(unknown)'}`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  const after = await listKeys(rpcUrl, vaultId);
  console.log(`\nAccess keys after (${after.length}):`);
  for (const key of after) {
    const permission =
      key.access_key.permission === 'FullAccess'
        ? 'FullAccess'
        : `FunctionCall(${key.access_key.permission.FunctionCall.receiver_id})`;
    console.log(`  ${key.public_key}  ${permission}`);
  }

  const fullAccess = after.filter((key) => key.access_key.permission === 'FullAccess');
  if (fullAccess.length > 0) {
    console.error('\nThe vault still has a full-access key. It is not locked.');
    process.exit(1);
  }
  console.log('\nVault is locked: no full-access keys remain.');
  console.log('Owner methods are still valid because the owner signs from its own account.');
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
