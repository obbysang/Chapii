/** Domain types mirrored from the Rust contract (contracts/vault/src/types.rs). */

import type { ReasonCode } from './reason-codes.js';

export type Asset = string; // "NEAR" | "ft:<account_id>"

export interface AssetLimit {
  asset: Asset;
  /** u128 as a decimal string. */
  per_tx_max: string;
  daily_max: string;
  cosign_above: string | null;
}

export interface Payee {
  label: string;
  chain: string;
  address: string;
  allowed_dest_assets: string[];
}

export interface Policy {
  limits: AssetLimit[];
  payees: Payee[];
  max_requests_per_hour: number;
  freeze_after_violations: number;
  expires_at_ns: number | null;
}

export const AGENT_STATUSES = ['ACTIVE', 'FROZEN', 'REVOKED'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface UsageCounter {
  asset: Asset;
  day_bucket: number;
  spent: string;
}

export interface Agent {
  name: string;
  status: AgentStatus;
  policy: Policy;
  created_at_ns: number;
  usage: UsageCounter[];
  rate_hour_bucket: number;
  rate_count: number;
  viol_hour_bucket: number;
  violations: number;
}

export interface AgentView {
  public_key: string;
  agent: Agent;
}

export const REQUEST_STATUSES = [
  'REJECTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'AWAITING_EXECUTION',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'REJECTED_BY_OWNER',
  'EXPIRED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface PaymentRequest {
  id: number;
  agent_pk: string;
  client_ref: string;
  asset: Asset;
  amount: string;
  chain: string;
  address: string;
  dest_asset: string | null;
  memo: string | null;
  status: RequestStatus;
  reason: ReasonCode | null;
  created_ns: number;
  decided_ns: number | null;
  deposit_address: string | null;
  settlement_ref: string | null;
  last_change_seq: number;
  usage_day_bucket: number;
}

export interface PaymentArgs {
  client_ref: string;
  asset: Asset;
  amount: string;
  chain: string;
  address: string;
  dest_asset?: string | null;
  memo?: string | null;
}

export type Decision =
  | { decision: 'APPROVED'; data: { request_id: number } }
  | { decision: 'PENDING_APPROVAL'; data: { request_id: number } }
  | { decision: 'REJECTED'; data: { request_id: number; reason: ReasonCode } }
  | { decision: 'DUPLICATE'; data: { request_id: number; status: RequestStatus } };

export interface BudgetEntry {
  asset: Asset;
  daily_max: string;
  spent_today: string;
  remaining: string;
  per_tx_max: string;
  cosign_above: string | null;
}

export interface Budget {
  per_asset: BudgetEntry[];
  rate_remaining: number;
  violations: number;
  status: AgentStatus;
  expires_at_ns: number | null;
}

export interface ChangesPage {
  requests: PaymentRequest[];
  latest_seq: number;
}

export interface StorageInfo {
  balance: string;
  storage_reserve: string;
  spendable: string;
}

export interface AgentViewResponse {
  publicKey: string;
  name: string;
  status: AgentStatus;
  policy: Policy;
  violations: number;
  createdAt: string;
}

export interface VaultSummary {
  vaultId: string;
  mode: 'local' | 'near';
  network: 'testnet' | 'mainnet';
  ownerId: string | null;
  label: string | null;
  paused: boolean;
  executorId: string | null;
  balances: { asset: Asset; amount: string }[];
  storage: StorageInfo | null;
  agents: AgentViewResponse[];
  pendingApprovals: number;
  stats24h: { approved: number; rejected: number; spent: string };
  health: 'ok' | 'degraded';
  contractVersion: string;
  updatedAt: string;
}

export interface RequestDto {
  id: string;
  vaultId: string;
  onchainId: number;
  agentPublicKey: string;
  agentName: string | null;
  clientRef: string;
  asset: Asset;
  amount: string;
  chain: string;
  address: string;
  destAsset: string | null;
  memo: string | null;
  status: RequestStatus;
  reason: ReasonCode | null;
  txHash: string | null;
  depositAddress: string | null;
  settlementRef: string | null;
  verification: 'UNVERIFIED' | 'OK' | 'MISMATCH';
  createdAt: string;
  decidedAt: string | null;
  jobState: string | null;
}

export interface HarnessRunDto {
  id: string;
  vaultId: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'ERROR';
  total: number;
  passed: number;
  controlsPassed: number;
  invariantsOk: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  results: HarnessResultDto[];
}

export interface HarnessResultDto {
  scenarioId: string;
  category: string;
  title: string;
  attack: string;
  expected: string;
  actual: string;
  passed: boolean;
  txHash?: string | null;
  invariantsOk: boolean;
  notes?: string | null;
  durationMs: number;
  /** Control scenarios are legitimate flows that must keep working. */
  control: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  mode: 'local' | 'near';
  network: 'testnet' | 'mainnet';
  chain: 'ok' | 'down';
  db: 'ok' | 'down';
  indexerLagMs: number;
  version: string;
  demoVaultId: string | null;
  harnessEnabled: boolean;
  timestamp: string;
}

export interface IntentsQuote {
  depositAddress: string;
  depositMemo?: string | null;
  originAsset: string;
  destinationAsset: string;
  amountIn: string;
  amountOut: string;
  deadline: string;
  timeEstimate: number;
  provider: string;
}
