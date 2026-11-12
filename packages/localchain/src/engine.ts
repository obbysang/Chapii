/**
 * LocalChain — a deterministic, offline implementation of the AgentVault
 * contract semantics. It exists so judges can run the full product with one
 * command and zero secrets. It is NOT the source of truth in production; when
 * NEAR_NETWORK credentials are configured the API uses the real contract and
 * this engine is disabled.
 *
 * Policy evaluation order mirrors contracts/vault/src/policy.rs exactly.
 */
import type {
  Agent,
  AgentStatus,
  Budget,
  Decision,
  PaymentArgs,
  PaymentRequest,
  Policy,
  RequestStatus,
  UsageCounter,
} from '@agentvault/shared';

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface NormalizedPayment {
  asset: string;
  amount: bigint;
  chain: string;
  address: string;
  dest_asset: string | null;
  memo: string | null;
}

export interface LocalRequest extends PaymentRequest {
  txHash: string | null;
  jobState: string | null;
  verification: 'UNVERIFIED' | 'OK' | 'MISMATCH';
}

export interface LocalAgentRecord {
  name: string;
  status: AgentStatus;
  policy: Policy;
  createdAtNs: number;
  usage: UsageCounter[];
  rateHourBucket: number;
  rateCount: number;
  violHourBucket: number;
  violations: number;
  allowanceYocto: string;
}

export interface LocalVaultState {
  version: 1;
  vaultId: string;
  ownerId: string;
  executorId: string | null;
  paused: boolean;
  agents: Record<string, LocalAgentRecord>;
  requests: LocalRequest[];
  clientRefs: Record<string, number>;
  nextRequestId: number;
  changeSeq: number;
  balances: Record<string, string>;
  createdAt: string;
}

export type LocalEventListener = (event: string, data: Record<string, unknown>) => void;

const HOUR_NS = 3_600_000_000_000;
const DAY_NS = 86_400_000_000_000;
const U128_MAX_BIGINT = 340282366920938463463374607431768211455n;
const APPROVAL_WINDOW_NS = 24 * HOUR_NS;
const STORAGE_RESERVE: Record<string, bigint> = {
  NEAR: 50_000_000_000_000_000_000_000n, // 0.05 NEAR
};

function normChain(raw: string): string | null {
  const chain = raw.trim().toLowerCase();
  if (chain.length < 2 || chain.length > 16) return null;
  if (!/^[a-z0-9-]+$/.test(chain)) return null;
  return chain;
}

const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

function normAddress(chain: string, raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 128) return null;
  if (chain === 'near') {
    const lower = value.toLowerCase();
    if (lower.length > 64) return null;
    if (/^[0-9a-f]{64}$/.test(lower)) return lower;
    return NEAR_ACCOUNT_RE.test(lower) ? lower : null;
  }
  if (chain === 'eth' || chain === 'base' || chain === 'arb' || chain === 'evm') {
    return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
  }
  return /^[A-Za-z0-9:._-]+$/.test(value) ? value : null;
}

function canonicalPolicy(policy: Policy): Policy {
  return {
    ...policy,
    expires_at_ns: policy.expires_at_ns ?? null,
    payees: policy.payees.map((p) => {
      const chain = p.chain.trim().toLowerCase();
      return { ...p, chain, address: normAddress(chain, p.address) ?? p.address };
    }),
  };
}

function validatePolicyShape(policy: Policy): void {
  const fail = (message: string): never => {
    throw new EngineError('INVALID_POLICY', message);
  };
  if (!Array.isArray(policy.limits) || policy.limits.length < 1 || policy.limits.length > 8) {
    fail('limits must contain 1..=8 entries');
  }
  const assets = new Set<string>();
  for (const limit of policy.limits) {
    if (assets.has(limit.asset)) fail('duplicate asset in limits');
    assets.add(limit.asset);
    if (BigInt(limit.per_tx_max) <= 0n) fail('per_tx_max must be > 0');
    if (BigInt(limit.daily_max) < BigInt(limit.per_tx_max)) fail('daily_max must be >= per_tx_max');
    if (limit.cosign_above != null && BigInt(limit.cosign_above) > BigInt(limit.per_tx_max)) {
      fail('cosign_above must be <= per_tx_max');
    }
    if (limit.asset !== 'NEAR' && !limit.asset.startsWith('ft:')) fail('invalid asset');
  }
  if (policy.payees.length > 50) fail('at most 50 payees');
  for (const payee of policy.payees) {
    if (!payee.label || payee.label.length > 40) fail('payee label must be 1..=40 characters');
    if (!normChain(payee.chain)) fail('invalid payee chain');
    if (!normAddress(payee.chain.trim().toLowerCase(), payee.address)) fail('invalid payee address');
    if (payee.allowed_dest_assets.length > 20) fail('at most 20 destination assets');
  }
  if (policy.max_requests_per_hour < 1 || policy.max_requests_per_hour > 200) {
    fail('max_requests_per_hour must be 1..=200');
  }
  if (policy.freeze_after_violations < 0 || policy.freeze_after_violations > 20) {
    fail('freeze_after_violations must be 0..=20');
  }
}

function blankAgent(name: string, policy: Policy, allowance: string, now: number): LocalAgentRecord {
  return {
    name,
    status: 'ACTIVE',
    policy: canonicalPolicy(policy),
    createdAtNs: now,
    usage: [],
    rateHourBucket: 0,
    rateCount: 0,
    violHourBucket: 0,
    violations: 0,
    allowanceYocto: allowance,
  };
}

function toPublicAgent(record: LocalAgentRecord): Agent {
  return {
    name: record.name,
    status: record.status,
    policy: record.policy,
    created_at_ns: record.createdAtNs,
    usage: record.usage,
    rate_hour_bucket: record.rateHourBucket,
    rate_count: record.rateCount,
    viol_hour_bucket: record.violHourBucket,
    violations: record.violations,
  };
}

function spentIn(record: LocalAgentRecord, asset: string, bucket: number): bigint {
  const found = record.usage.find((u) => u.asset === asset && u.day_bucket === bucket);
  return found ? BigInt(found.spent) : 0n;
}

function setSpent(record: LocalAgentRecord, asset: string, bucket: number, value: bigint): void {
  const index = record.usage.findIndex((u) => u.asset === asset && u.day_bucket === bucket);
  if (index >= 0) {
    record.usage[index] = { asset, day_bucket: bucket, spent: value.toString() };
  } else {
    record.usage = record.usage.filter((u) => u.asset !== asset);
    record.usage.push({ asset, day_bucket: bucket, spent: value.toString() });
  }
}

interface EvalResult {
  status: RequestStatus;
  reason: PaymentRequest['reason'];
  violation: boolean;
}

function reject(reason: NonNullable<PaymentRequest['reason']>, violation: boolean): EvalResult {
  return { status: 'REJECTED', reason, violation };
}

export class LocalVault {
  state: LocalVaultState;
  private clock: () => number;
  private listener?: LocalEventListener;

  constructor(state: LocalVaultState, opts: { clock?: () => number; listener?: LocalEventListener } = {}) {
    this.state = state;
    this.clock = opts.clock ?? (() => Date.now());
    this.listener = opts.listener;
  }

  static create(params: {
    vaultId: string;
    ownerId: string;
    balances?: Record<string, string>;
    clock?: () => number;
    listener?: LocalEventListener;
  }): LocalVault {
    const state: LocalVaultState = {
      version: 1,
      vaultId: params.vaultId,
      ownerId: params.ownerId,
      executorId: null,
      paused: false,
      agents: {},
      requests: [],
      clientRefs: {},
      nextRequestId: 1,
      changeSeq: 0,
      balances: { NEAR: '0', ...(params.balances ?? {}) },
      createdAt: new Date((params.clock?.() ?? Date.now())).toISOString(),
    };
    return new LocalVault(state, params);
  }

  static fromJSON(json: unknown, opts: { clock?: () => number; listener?: LocalEventListener } = {}): LocalVault {
    const state = json as LocalVaultState;
    if (!state || state.version !== 1) throw new EngineError('BAD_STATE', 'unsupported local state');
    return new LocalVault(state, opts);
  }

  setListener(listener?: LocalEventListener): void {
    this.listener = listener;
  }

  private now(): number {
    return Math.floor(this.clock() * 1_000_000);
  }

  private emit(event: string, data: Record<string, unknown>): void {
    this.listener?.(event, data);
  }

  private touch(id: number): number {
    this.state.changeSeq += 1;
    const request = this.state.requests.find((r) => r.id === id);
    if (request) request.last_change_seq = this.state.changeSeq;
    return this.state.changeSeq;
  }

  private assertOwner(caller: string): void {
    if (caller !== this.state.ownerId) {
      throw new EngineError('UNAUTHORIZED', 'only the vault owner can call this method');
    }
  }

  private agent(pk: string): LocalAgentRecord {
    const agent = this.state.agents[pk];
    if (!agent) throw new EngineError('UNKNOWN_AGENT', 'unknown agent key');
    return agent;
  }

  // -------------------------------------------------------------------------
  // Owner operations
  // -------------------------------------------------------------------------

  addAgent(
    caller: string,
    publicKey: string,
    name: string,
    policy: Policy,
    allowanceYocto = '1000000000000000000000000',
  ): Agent {
    this.assertOwner(caller);
    if (this.state.agents[publicKey]) throw new EngineError('DUPLICATE_AGENT', 'agent key already registered');
    if (!name.trim() || name.length > 40) throw new EngineError('INVALID_AGENT', 'agent name must be 1..=40 characters');
    validatePolicyShape(policy);
    const agent = blankAgent(name, policy, allowanceYocto, this.now());
    this.state.agents[publicKey] = agent;
    this.emit('agent_added', { public_key: publicKey, name, policy: agent.policy });
    return toPublicAgent(agent);
  }

  updatePolicy(caller: string, publicKey: string, policy: Policy): void {
    this.assertOwner(caller);
    const agent = this.agent(publicKey);
    if (agent.status === 'REVOKED') throw new EngineError('AGENT_REVOKED', 'agent is revoked');
    validatePolicyShape(policy);
    agent.policy = canonicalPolicy(policy);
    this.emit('agent_policy_updated', { public_key: publicKey, policy: agent.policy });
  }

  setAllowance(caller: string, publicKey: string, allowanceYocto: string): void {
    this.assertOwner(caller);
    const agent = this.agent(publicKey);
    if (agent.status === 'REVOKED') throw new EngineError('AGENT_REVOKED', 'agent is revoked');
    agent.allowanceYocto = allowanceYocto;
    this.emit('agent_allowance_set', { public_key: publicKey, allowance_yocto: allowanceYocto });
  }

  freezeAgent(caller: string, publicKey: string): void {
    this.assertOwner(caller);
    const agent = this.agent(publicKey);
    if (agent.status === 'REVOKED') throw new EngineError('AGENT_REVOKED', 'agent is revoked');
    agent.status = 'FROZEN';
    this.emit('agent_frozen', { public_key: publicKey });
    this.emit('agent.updated', { public_key: publicKey, status: agent.status });
  }

  unfreezeAgent(caller: string, publicKey: string): void {
    this.assertOwner(caller);
    const agent = this.agent(publicKey);
    if (agent.status === 'REVOKED') throw new EngineError('AGENT_REVOKED', 'agent is revoked');
    agent.status = 'ACTIVE';
    agent.violations = 0;
    agent.violHourBucket = 0;
    this.emit('agent_unfrozen', { public_key: publicKey });
    this.emit('agent.updated', { public_key: publicKey, status: agent.status });
  }

  revokeAgent(caller: string, publicKey: string): void {
    this.assertOwner(caller);
    const agent = this.agent(publicKey);
    agent.status = 'REVOKED';
    this.emit('agent_revoked', { public_key: publicKey });
    this.emit('agent.updated', { public_key: publicKey, status: 'REVOKED' });
  }

  pause(caller: string): void {
    this.assertOwner(caller);
    this.state.paused = true;
    this.emit('vault_paused', { paused: true });
    this.emit('vault.updated', { paused: true });
  }

  unpause(caller: string): void {
    this.assertOwner(caller);
    this.state.paused = false;
    this.emit('vault_unpaused', { paused: false });
    this.emit('vault.updated', { paused: false });
  }

  setExecutor(caller: string, executorId: string | null): void {
    this.assertOwner(caller);
    this.state.executorId = executorId;
    this.emit('executor_set', { executor_id: executorId });
  }

  fund(asset: string, amount: string): void {
    if (!/^(0|[1-9]\d*)$/.test(amount) || BigInt(amount) <= 0n) {
      throw new EngineError('INVALID_INPUT', 'funding amount must be > 0');
    }
    const balance = BigInt(this.state.balances[asset] ?? '0');
    this.state.balances[asset] = (balance + BigInt(amount)).toString();
    this.emit('vault_funded', { asset, amount });
  }

  withdraw(caller: string, asset: string, amount: string, to: string): void {
    this.assertOwner(caller);
    const balance = BigInt(this.state.balances[asset] ?? '0');
    if (BigInt(amount) <= 0n) throw new EngineError('INVALID_INPUT', 'amount must be > 0');
    if (balance < BigInt(amount)) throw new EngineError('INSUFFICIENT_BALANCE', 'insufficient balance');
    this.state.balances[asset] = (balance - BigInt(amount)).toString();
    this.emit('withdrawal', { asset, amount, to });
  }

  approveRequest(caller: string, requestId: number): LocalRequest {
    this.assertOwner(caller);
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) throw new EngineError('UNKNOWN_REQUEST', 'unknown request');
    if (request.status !== 'PENDING_APPROVAL') throw new EngineError('NOT_PENDING', 'request is not pending approval');
    const now = this.now();
    if (now - request.created_ns > APPROVAL_WINDOW_NS) {
      request.status = 'EXPIRED';
      request.reason = 'APPROVAL_EXPIRED';
      request.decided_ns = now;
      this.touch(requestId);
      this.emit('owner_rejected', { request_id: requestId, reason: 'APPROVAL_EXPIRED' });
      return request;
    }
    const agent = this.agent(request.agent_pk);
    const dayBucket = Math.floor(now / DAY_NS);
    const hourBucket = Math.floor(now / HOUR_NS);
    const outcome = this.evaluateApproval(agent, request, now, dayBucket);
    if (outcome.reason) {
      if (outcome.violation) this.bumpViolation(agent, hourBucket);
      request.status = outcome.status;
      request.reason = outcome.reason;
      request.decided_ns = now;
      this.touch(requestId);
      this.emit('payment_rejected', { request_id: requestId, reason: outcome.reason, status: request.status });
      return request;
    }
    setSpent(agent, request.asset, dayBucket, spentIn(agent, request.asset, dayBucket) + BigInt(request.amount));
    request.usage_day_bucket = dayBucket;
    request.status = outcome.status;
    request.decided_ns = now;
    this.touch(requestId);
    this.emit('owner_approved', { request_id: requestId });
    this.emit('payment_approved', {
      request_id: requestId,
      status: request.status,
      asset: request.asset,
      amount: request.amount,
      chain: request.chain,
      address: request.address,
    });
    if (request.status === 'APPROVED') this.settleSameChain(request);
    return request;
  }

  rejectRequest(caller: string, requestId: number): LocalRequest {
    this.assertOwner(caller);
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) throw new EngineError('UNKNOWN_REQUEST', 'unknown request');
    if (request.status !== 'PENDING_APPROVAL') throw new EngineError('NOT_PENDING', 'request is not pending approval');
    request.status = 'REJECTED_BY_OWNER';
    request.reason = 'OWNER_REJECTED';
    request.decided_ns = this.now();
    this.touch(requestId);
    this.emit('owner_rejected', { request_id: requestId, reason: 'OWNER_REJECTED' });
    return request;
  }

  expireRequest(requestId: number): void {
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request || request.status !== 'PENDING_APPROVAL') return;
    const now = this.now();
    if (now - request.created_ns <= APPROVAL_WINDOW_NS) return;
    request.status = 'EXPIRED';
    request.reason = 'APPROVAL_EXPIRED';
    request.decided_ns = now;
    this.touch(requestId);
    this.emit('payment_rejected', { request_id: requestId, reason: 'APPROVAL_EXPIRED' });
  }

  // -------------------------------------------------------------------------
  // Agent operation
  // -------------------------------------------------------------------------

  requestPayment(publicKey: string, args: PaymentArgs): Decision {
    const agent = this.agent(publicKey);
    if (agent.status === 'REVOKED') {
      throw new EngineError('UNKNOWN_AGENT', 'signer key is not a registered agent');
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(args.client_ref)) {
      throw new EngineError('INVALID_CLIENT_REF', 'client_ref must be 1..=64 chars of [A-Za-z0-9_-]');
    }
    const refKey = `${publicKey}|${args.client_ref}`;
    const existingId = this.state.clientRefs[refKey];
    if (existingId != null) {
      const existing = this.state.requests.find((r) => r.id === existingId);
      if (existing) {
        this.emit('payment_duplicate', {
          request_id: existingId,
          agent_pk: publicKey,
          client_ref: args.client_ref,
          status: existing.status,
        });
        return { decision: 'DUPLICATE', data: { request_id: existingId, status: existing.status } };
      }
      delete this.state.clientRefs[refKey];
    }

    const now = this.now();
    const hourBucket = Math.floor(now / HOUR_NS);
    const dayBucket = Math.floor(now / DAY_NS);
    this.bumpRate(agent, hourBucket);

    const id = this.state.nextRequestId++;
    const normalized = this.normalizeArgs(args);
    const outcome = this.evaluate(agent, normalized, now, dayBucket, hourBucket);

    const request: LocalRequest = {
      id,
      agent_pk: publicKey,
      client_ref: args.client_ref,
      asset: args.asset,
      amount: args.amount,
      chain: normalized?.chain ?? args.chain.toLowerCase(),
      address: normalized?.address ?? args.address,
      dest_asset: normalized?.dest_asset ?? args.dest_asset ?? null,
      memo: args.memo ?? null,
      status: outcome.status,
      reason: outcome.reason,
      created_ns: now,
      decided_ns: outcome.status === 'PENDING_APPROVAL' ? null : now,
      deposit_address: null,
      settlement_ref: null,
      last_change_seq: 0,
      usage_day_bucket: 0,
      txHash: null,
      jobState: null,
      verification: 'UNVERIFIED',
    };

    if (outcome.violation) this.bumpViolation(agent, hourBucket);

    if (request.status === 'APPROVED' || request.status === 'AWAITING_EXECUTION') {
      setSpent(agent, request.asset, dayBucket, spentIn(agent, request.asset, dayBucket) + BigInt(request.amount));
      request.usage_day_bucket = dayBucket;
    }

    if (request.status === 'AWAITING_EXECUTION') request.jobState = 'QUEUED';
    this.state.requests.push(request);
    this.state.clientRefs[refKey] = id;
    this.touch(id);

    this.emit('payment_requested', {
      request_id: id,
      agent_pk: publicKey,
      client_ref: request.client_ref,
      asset: request.asset,
      amount: request.amount,
      chain: request.chain,
      address: request.address,
      dest_asset: request.dest_asset,
      memo: request.memo,
      status: request.status,
      reason: request.reason,
    });

    if (request.status === 'APPROVED' || request.status === 'AWAITING_EXECUTION') {
      this.emit('payment_approved', {
        request_id: id,
        status: request.status,
        asset: request.asset,
        amount: request.amount,
        chain: request.chain,
        address: request.address,
      });
      if (request.status === 'APPROVED') this.settleSameChain(request);
      return { decision: 'APPROVED', data: { request_id: id } };
    }
    if (request.status === 'PENDING_APPROVAL') {
      this.emit('payment_pending', { request_id: id });
      return { decision: 'PENDING_APPROVAL', data: { request_id: id } };
    }
    this.emit('payment_rejected', {
      request_id: id,
      reason: request.reason,
      status: request.status,
    });
    return {
      decision: 'REJECTED',
      data: { request_id: id, reason: request.reason ?? 'INVALID_INPUT' },
    };
  }

  // -------------------------------------------------------------------------
  // Executor simulation (local mode)
  // -------------------------------------------------------------------------

  executeCrosschain(requestId: number, depositAddress: string): LocalRequest {
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) throw new EngineError('UNKNOWN_REQUEST', 'unknown request');
    if (request.status !== 'AWAITING_EXECUTION') throw new EngineError('NOT_AWAITING', 'request is not awaiting execution');
    if (this.state.paused) throw new EngineError('VAULT_PAUSED', 'vault is paused');
    if (!request.asset.startsWith('ft:')) throw new EngineError('INVALID_ASSET', 'cross-chain payouts require an FT');
    const agent = this.state.agents[request.agent_pk];
    if (!agent || agent.status !== 'ACTIVE') throw new EngineError('AGENT_FROZEN', 'agent is not active');
    const balance = BigInt(this.state.balances[request.asset] ?? '0');
    request.deposit_address = depositAddress;
    request.jobState = 'FUNDING';
    request.status = 'EXECUTING';
    this.touch(requestId);
    if (balance < BigInt(request.amount)) {
      request.status = 'FAILED';
      request.reason = 'TRANSFER_FAILED';
      request.decided_ns = this.now();
      request.jobState = 'FAILED';
      this.rollback(request);
      this.touch(requestId);
      this.emit('payment_failed', { request_id: requestId, reason: 'TRANSFER_FAILED' });
      return request;
    }
    this.state.balances[request.asset] = (balance - BigInt(request.amount)).toString();
    request.jobState = 'FUNDED';
    this.emit('crosschain_funded', { request_id: requestId, deposit_address: depositAddress });
    return request;
  }

  settleCrosschain(
    requestId: number,
    outcome: 'DELIVERED' | 'REFUNDED' | 'FAILED',
    settlementRef: string,
  ): LocalRequest {
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) throw new EngineError('UNKNOWN_REQUEST', 'unknown request');
    if (request.status !== 'EXECUTING') {
      throw new EngineError('NOT_EXECUTING', 'request is not executing');
    }
    request.settlement_ref = settlementRef;
    request.decided_ns = this.now();
    if (outcome === 'DELIVERED') {
      request.status = 'COMPLETED';
      request.jobState = 'DELIVERED';
      request.verification = 'OK';
      this.touch(requestId);
      this.emit('crosschain_settled', { request_id: requestId, outcome, settlement_ref: settlementRef });
      this.emit('payment_completed', { request_id: requestId });
    } else {
      request.status = 'FAILED';
      request.reason = 'TRANSFER_FAILED';
      request.jobState = outcome === 'REFUNDED' ? 'REFUNDED' : 'FAILED';
      this.touch(requestId);
      this.emit('crosschain_settled', { request_id: requestId, outcome, settlement_ref: settlementRef });
      this.emit('payment_failed', { request_id: requestId, reason: 'TRANSFER_FAILED' });
    }
    return request;
  }

  // -------------------------------------------------------------------------
  // Evaluation (mirrors contracts/vault/src/policy.rs)
  // -------------------------------------------------------------------------

  private normalizeArgs(args: PaymentArgs): NormalizedPayment | null {
    const chain = normChain(args.chain);
    if (!chain) return null;
    const address = normAddress(chain, args.address);
    if (!address) return null;
    if (!/^(0|[1-9]\d*)$/.test(args.amount)) return null;
    if (BigInt(args.amount) > U128_MAX_BIGINT) return null;
    if (!args.asset || (args.asset !== 'NEAR' && !args.asset.startsWith('ft:'))) return null;
    if (args.memo != null && args.memo.length > 140) return null;
    if (args.dest_asset != null && (!args.dest_asset || args.dest_asset.length > 64)) return null;
    return {
      asset: args.asset,
      amount: BigInt(args.amount),
      chain,
      address,
      dest_asset: args.dest_asset ?? null,
      memo: args.memo ?? null,
    };
  }

  private evaluate(
    agent: LocalAgentRecord,
    normalized: NormalizedPayment | null,
    now: number,
    dayBucket: number,
    hourBucket: number,
  ): EvalResult {
    if (this.state.paused) return reject('VAULT_PAUSED', false);
    if (agent.status !== 'ACTIVE') return reject('AGENT_FROZEN', false);
    if (agent.policy.expires_at_ns != null && now >= agent.policy.expires_at_ns) {
      return reject('POLICY_EXPIRED', true);
    }
    if (!normalized || normalized.amount <= 0n) return reject('INVALID_INPUT', true);
    const limit = agent.policy.limits.find((l) => l.asset === normalized.asset);
    if (!limit) return reject('ASSET_NOT_ALLOWED', true);
    const payee = agent.policy.payees.find(
      (p) => p.chain === normalized.chain && p.address === normalized.address,
    );
    if (!payee) return reject('PAYEE_NOT_ALLOWED', true);
    if (payee.allowed_dest_assets.length > 0) {
      if (!normalized.dest_asset || !payee.allowed_dest_assets.includes(normalized.dest_asset)) {
        return reject('DEST_ASSET_NOT_ALLOWED', true);
      }
    }
    if (normalized.amount > BigInt(limit.per_tx_max)) return reject('PER_TX_CAP_EXCEEDED', true);
    if (agent.rateHourBucket === hourBucket && agent.rateCount > agent.policy.max_requests_per_hour) {
      return reject('RATE_LIMIT_EXCEEDED', true);
    }
    const spent = spentIn(agent, normalized.asset, dayBucket);
    if (spent + normalized.amount > BigInt(limit.daily_max)) return reject('DAILY_CAP_EXCEEDED', true);
    if (normalized.chain === 'near' && normalized.asset === 'NEAR') {
      const balance = BigInt(this.state.balances.NEAR ?? '0');
      const reserve = STORAGE_RESERVE.NEAR ?? 0n;
      if (normalized.amount > (balance > reserve ? balance - reserve : 0n)) {
        return reject('INSUFFICIENT_BALANCE', false);
      }
    }
    if (limit.cosign_above != null && normalized.amount > BigInt(limit.cosign_above)) {
      return { status: 'PENDING_APPROVAL', reason: null, violation: false };
    }
    return {
      status: normalized.chain === 'near' ? 'APPROVED' : 'AWAITING_EXECUTION',
      reason: null,
      violation: false,
    };
  }

  private evaluateApproval(agent: LocalAgentRecord, request: LocalRequest, now: number, dayBucket: number): EvalResult {
    if (this.state.paused) return reject('VAULT_PAUSED', false);
    if (agent.status !== 'ACTIVE') return reject('AGENT_FROZEN', false);
    if (agent.policy.expires_at_ns != null && now >= agent.policy.expires_at_ns) {
      return reject('POLICY_EXPIRED', true);
    }
    const limit = agent.policy.limits.find((l) => l.asset === request.asset);
    if (!limit) return reject('ASSET_NOT_ALLOWED', true);
    const payee = agent.policy.payees.find((p) => p.chain === request.chain && p.address === request.address);
    if (!payee) return reject('PAYEE_NOT_ALLOWED', true);
    if (payee.allowed_dest_assets.length > 0) {
      if (!request.dest_asset || !payee.allowed_dest_assets.includes(request.dest_asset)) {
        return reject('DEST_ASSET_NOT_ALLOWED', true);
      }
    }
    if (BigInt(request.amount) > BigInt(limit.per_tx_max)) return reject('PER_TX_CAP_EXCEEDED', true);
    const spent = spentIn(agent, request.asset, dayBucket);
    if (spent + BigInt(request.amount) > BigInt(limit.daily_max)) return reject('DAILY_CAP_EXCEEDED', true);
    if (request.chain === 'near' && request.asset === 'NEAR') {
      const balance = BigInt(this.state.balances.NEAR ?? '0');
      const reserve = STORAGE_RESERVE.NEAR ?? 0n;
      if (BigInt(request.amount) > (balance > reserve ? balance - reserve : 0n)) {
        return reject('INSUFFICIENT_BALANCE', false);
      }
    }
    return {
      status: request.chain === 'near' ? 'APPROVED' : 'AWAITING_EXECUTION',
      reason: null,
      violation: false,
    };
  }

  private bumpRate(agent: LocalAgentRecord, hourBucket: number): void {
    if (agent.rateHourBucket !== hourBucket) {
      agent.rateHourBucket = hourBucket;
      agent.rateCount = 0;
    }
    agent.rateCount += 1;
  }

  private bumpViolation(agent: LocalAgentRecord, hourBucket: number): void {
    if (agent.violHourBucket !== hourBucket) {
      agent.violHourBucket = hourBucket;
      agent.violations = 0;
    }
    agent.violations += 1;
    if (agent.policy.freeze_after_violations > 0 && agent.violations >= agent.policy.freeze_after_violations) {
      agent.status = 'FROZEN';
      this.emit('agent_auto_frozen', { public_key: this.keyOf(agent), violations: agent.violations });
      this.emit('agent.updated', { public_key: this.keyOf(agent), status: 'FROZEN' });
    }
  }

  private keyOf(agent: LocalAgentRecord): string {
    return Object.keys(this.state.agents).find((k) => this.state.agents[k] === agent) ?? '';
  }

  private settleSameChain(request: LocalRequest): void {
    const balance = BigInt(this.state.balances[request.asset] ?? '0');
    const amount = BigInt(request.amount);
    if (request.chain === 'near' && request.asset === 'NEAR') {
      const reserve = STORAGE_RESERVE.NEAR ?? 0n;
      if (balance < amount + reserve) {
        request.status = 'FAILED';
        request.reason = 'TRANSFER_FAILED';
        request.decided_ns = this.now();
        this.rollback(request);
        this.touch(request.id);
        this.emit('payment_failed', { request_id: request.id, reason: 'TRANSFER_FAILED' });
        return;
      }
    } else if (balance < amount) {
      request.status = 'FAILED';
      request.reason = 'TRANSFER_FAILED';
      request.decided_ns = this.now();
      this.rollback(request);
      this.touch(request.id);
      this.emit('payment_failed', { request_id: request.id, reason: 'TRANSFER_FAILED' });
      return;
    }
    this.state.balances[request.asset] = (balance - amount).toString();
    request.status = 'COMPLETED';
    request.decided_ns = this.now();
    request.txHash = `local_${this.state.vaultId.replace(/\./g, '_')}_${request.id}_${this.state.changeSeq}`;
    this.touch(request.id);
    this.emit('payment_completed', { request_id: request.id, tx_hash: request.txHash });
  }

  private rollback(request: LocalRequest): void {
    const currentDay = Math.floor(this.now() / DAY_NS);
    if (currentDay !== request.usage_day_bucket) return;
    const agent = this.state.agents[request.agent_pk];
    if (!agent) return;
    const spent = spentIn(agent, request.asset, currentDay);
    setSpent(agent, request.asset, currentDay, spent > BigInt(request.amount) ? spent - BigInt(request.amount) : 0n);
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  getAgent(publicKey: string): Agent | undefined {
    const agent = this.state.agents[publicKey];
    return agent ? toPublicAgent(agent) : undefined;
  }

  getAgents(from = 0, limit = 100): { publicKey: string; agent: Agent }[] {
    return Object.entries(this.state.agents)
      .slice(from, from + Math.min(limit, 100))
      .map(([publicKey, agent]) => ({ publicKey, agent: toPublicAgent(agent) }));
  }

  getRequest(id: number): LocalRequest | undefined {
    return this.state.requests.find((r) => r.id === id);
  }

  getRequests(opts: { fromId?: number; limit?: number; reverse?: boolean; status?: string; agent?: string; reason?: string; q?: string } = {}): LocalRequest[] {
    const { fromId = 0, limit = 50, reverse = false } = opts;
    let items = this.state.requests.filter((r) => (reverse ? r.id < fromId : r.id >= fromId));
    if (opts.status) items = items.filter((r) => r.status === opts.status);
    if (opts.agent) items = items.filter((r) => r.agent_pk === opts.agent);
    if (opts.reason) items = items.filter((r) => r.reason === opts.reason);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      items = items.filter(
        (r) =>
          r.address.toLowerCase().includes(q) ||
          (r.memo ?? '').toLowerCase().includes(q) ||
          r.client_ref.toLowerCase().includes(q),
      );
    }
    items = [...items].sort((a, b) => (reverse ? b.id - a.id : a.id - b.id));
    return items.slice(0, limit);
  }

  getPendingRequests(): LocalRequest[] {
    return this.state.requests.filter((r) => r.status === 'PENDING_APPROVAL').sort((a, b) => a.id - b.id);
  }

  getBudget(publicKey: string): Budget | undefined {
    const agent = this.state.agents[publicKey];
    if (!agent) return undefined;
    const now = this.now();
    const dayBucket = Math.floor(now / DAY_NS);
    const hourBucket = Math.floor(now / HOUR_NS);
    return {
      per_asset: agent.policy.limits.map((limit) => {
        const spent = spentIn(agent, limit.asset, dayBucket);
        return {
          asset: limit.asset,
          daily_max: limit.daily_max,
          spent_today: spent.toString(),
          remaining: (BigInt(limit.daily_max) > spent ? BigInt(limit.daily_max) - spent : 0n).toString(),
          per_tx_max: limit.per_tx_max,
          cosign_above: limit.cosign_above,
        };
      }),
      rate_remaining:
        agent.rateHourBucket === hourBucket
          ? Math.max(0, agent.policy.max_requests_per_hour - agent.rateCount)
          : agent.policy.max_requests_per_hour,
      violations: agent.violHourBucket === hourBucket ? agent.violations : 0,
      status: agent.status,
      expires_at_ns: agent.policy.expires_at_ns,
    };
  }

  getChangesSince(seq: number, limit = 100): { requests: LocalRequest[]; latestSeq: number } {
    const changed = this.state.requests
      .filter((r) => r.last_change_seq > seq)
      .sort((a, b) => a.last_change_seq - b.last_change_seq)
      .slice(0, limit);
    return {
      requests: changed,
      latestSeq: changed.length > 0 ? changed[changed.length - 1]!.last_change_seq : seq,
    };
  }

  balanceOf(asset: string): string {
    return this.state.balances[asset] ?? '0';
  }

  snapshot(): LocalVaultState {
    return JSON.parse(JSON.stringify(this.state)) as LocalVaultState;
  }

  requestDto(request: LocalRequest): Record<string, unknown> {
    return {
      ...request,
      agentName: this.state.agents[request.agent_pk]?.name ?? null,
    };
  }
}
