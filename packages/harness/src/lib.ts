import { AgentVaultClient, OwnerClient } from "@agentvault/sdk";
import { KeyPair } from "near-api-js";

export interface RunContext {
  network: "testnet" | "mainnet";
  vault: string;
  owner: OwnerClient;
  ownerAccount: string;
  attacker: string;
  approvedSum: bigint;
}

export interface ScenarioResult {
  id: string;
  category: string;
  title: string;
  expected: string;
  actual: string;
  passed: boolean;
  txHash?: string | undefined;
  invariantsOk: boolean;
  notes?: string;
  durationMs: number;
  skipped?: boolean;
}

const NEAR = 10n ** 24n;
const U = (n: bigint) => n.toString();

export function basePolicy(overrides: {
  perTx?: bigint;
  daily?: bigint;
  cosign?: bigint | null;
  rate?: number;
  freeze?: number;
  payees?: Array<{ label: string; chain: string; address: string; allowed_dest_assets: string[] }>;
  extraLimitAsset?: string;
}) {
  const perTx = overrides.perTx ?? 5n * NEAR;
  const daily = overrides.daily ?? 20n * NEAR;
  const limits: Array<Record<string, unknown>> = [
    {
      asset: "NEAR",
      per_tx_max: U(perTx),
      daily_max: U(daily),
      cosign_above: overrides.cosign === undefined ? null : overrides.cosign === null ? null : U(overrides.cosign),
    },
  ];
  if (overrides.extraLimitAsset) {
    limits.push({ asset: overrides.extraLimitAsset, per_tx_max: U(1n), daily_max: U(1n), cosign_above: null });
  }
  return {
    limits,
    payees: overrides.payees ?? [
      { label: "alice", chain: "near", address: "avpayee.testnet", allowed_dest_assets: [] },
    ],
    max_requests_per_hour: overrides.rate ?? 10,
    freeze_after_violations: overrides.freeze ?? 3,
    expires_at_ns: null as number | null,
  };
}

export async function freshAgent(ctx: RunContext, name: string, policy: unknown): Promise<{
  pk: string;
  privateKey: string;
  client: AgentVaultClient;
}> {
  const kp = KeyPair.fromRandom("ed25519");
  const privateKey = kp.toString();
  const { publicKey } = await ctx.owner.addAgent(ctx.vault, {
    agentPrivateKey: privateKey,
    name,
    policy,
    allowanceYocto: U(5n * NEAR),
  });
  await new Promise((r) => setTimeout(r, 700));
  const client = new AgentVaultClient({
    network: ctx.network,
    vaultAccountId: ctx.vault,
    agentPrivateKey: privateKey,
  });
  return { pk: publicKey, privateKey, client };
}

export async function cleanupAgent(ctx: RunContext, pk: string): Promise<void> {
  try {
    await ctx.owner.revokeAgent(ctx.vault, pk);
  } catch {
    /* key may already be gone */
  }
}

export function payArgs(clientRef: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    client_ref: clientRef,
    asset: "NEAR",
    amount: U(1n * NEAR),
    chain: "near",
    address: "avpayee.testnet",
    dest_asset: "NEAR",
    memo: "harness",
    ...over,
  };
}
