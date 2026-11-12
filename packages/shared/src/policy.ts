import { ONE_NEAR } from './constants.js';
import { formatUnits } from './format.js';
import type { AssetLimit, Payee, Policy } from './types.js';

export type TemplateKind = 'conservative' | 'ops' | 'custom';

export interface TemplateOptions {
  asset: string;
  payees?: Payee[];
  /** Human amounts in whole units, e.g. "5". */
  perTx?: string;
  daily?: string;
  cosignAbove?: string | null;
  maxRequestsPerHour?: number;
  freezeAfterViolations?: number;
  decimals?: number;
}

function toRaw(human: string, decimals: number): string {
  const [whole, frac = ''] = human.split('.');
  if (!/^\d*$/.test(whole ?? '') || !/^\d*$/.test(frac)) {
    throw new Error(`invalid amount ${human}`);
  }
  const padded = (frac ?? '').padEnd(decimals, '0').slice(0, decimals);
  return (BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0')).toString();
}

export function makeLimit(
  asset: string,
  perTx: string,
  daily: string,
  cosignAbove: string | null,
  decimals = asset === 'NEAR' ? 24 : 6,
): AssetLimit {
  return {
    asset,
    per_tx_max: toRaw(perTx, decimals),
    daily_max: toRaw(daily, decimals),
    cosign_above: cosignAbove == null ? null : toRaw(cosignAbove, decimals),
  };
}

export function buildTemplate(kind: TemplateKind, opts: TemplateOptions): Policy {
  const decimals = opts.decimals ?? (opts.asset === 'NEAR' ? 24 : 6);
  if (kind === 'conservative') {
    return {
      limits: [
        makeLimit(opts.asset, opts.perTx ?? '5', opts.daily ?? '20', opts.cosignAbove ?? '10', decimals),
      ],
      payees: opts.payees ?? [],
      max_requests_per_hour: opts.maxRequestsPerHour ?? 10,
      freeze_after_violations: opts.freezeAfterViolations ?? 3,
      expires_at_ns: null,
    };
  }
  if (kind === 'ops') {
    return {
      limits: [
        makeLimit(opts.asset, opts.perTx ?? '50', opts.daily ?? '200', opts.cosignAbove ?? null, decimals),
      ],
      payees: opts.payees ?? [],
      max_requests_per_hour: opts.maxRequestsPerHour ?? 60,
      freeze_after_violations: opts.freezeAfterViolations ?? 5,
      expires_at_ns: null,
    };
  }
  return {
    limits: [makeLimit(opts.asset, opts.perTx ?? '5', opts.daily ?? '20', opts.cosignAbove ?? null, decimals)],
    payees: opts.payees ?? [],
    max_requests_per_hour: opts.maxRequestsPerHour ?? 10,
    freeze_after_violations: opts.freezeAfterViolations ?? 3,
    expires_at_ns: null,
  };
}

const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function validatePayeeAddress(chain: string, address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return 'Address is required';
  if (trimmed.length > 128) return 'Address too long';
  if (chain === 'near') {
    if (!NEAR_ACCOUNT_RE.test(trimmed) && !/^[0-9a-f]{64}$/.test(trimmed)) {
      return 'Invalid NEAR account id';
    }
    return null;
  }
  if (chain === 'eth' || chain === 'base' || chain === 'arb' || chain === 'evm') {
    if (!EVM_RE.test(trimmed)) return 'Expected 0x followed by 40 hex characters';
    return null;
  }
  if (chain === 'sol' || chain === 'solana') {
    if (!BASE58_RE.test(trimmed)) return 'Invalid Solana address';
    return null;
  }
  if (!/^[A-Za-z0-9:._-]+$/.test(trimmed)) return 'Invalid address characters';
  return null;
}

export function normalizePayeeAddress(chain: string, address: string): string {
  const trimmed = address.trim();
  if (chain === 'near') return trimmed.toLowerCase();
  if (chain === 'eth' || chain === 'base' || chain === 'arb' || chain === 'evm') {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function normalizePayee(payee: Payee): Payee {
  return {
    ...payee,
    chain: payee.chain.toLowerCase(),
    address: normalizePayeeAddress(payee.chain.toLowerCase(), payee.address),
  };
}

export function estimateDailyLoss(policy: Policy): string {
  // Amounts can be in different assets; sum in raw units is only meaningful for
  // a single asset. We report the sum and let the caller add symbols.
  return policy.limits.reduce((acc, l) => acc + BigInt(l.daily_max), 0n).toString();
}

export function summarisePolicy(policy: Policy): string {
  if (policy.limits.length === 0) return 'No spending limits configured.';
  const limits = policy.limits
    .map((l) => {
      const decimals = l.asset === 'NEAR' ? 24 : 6;
      const symbol = l.asset === 'NEAR' ? 'NEAR' : l.asset.replace('ft:', '').split('.')[0]!.toUpperCase();
      const cosign =
        l.cosign_above != null
          ? ` Payments above ${formatUnits(l.cosign_above, decimals, 2)} ${symbol} need your approval.`
          : '';
      return `up to ${formatUnits(l.per_tx_max, decimals, 2)} ${symbol} per payment and ${formatUnits(
        l.daily_max,
        decimals,
        2,
      )} ${symbol} per day.${cosign}`;
    })
    .join(' ');
  const freeze =
    policy.freeze_after_violations > 0
      ? ` After ${policy.freeze_after_violations} violations in an hour the agent freezes automatically.`
      : '';
  return `This agent can pay ${limits} It may call the vault ${policy.max_requests_per_hour} times per hour and can pay ${
    policy.payees.length
  } allowlisted recipient${policy.payees.length === 1 ? '' : 's'}.${freeze}`;
}

export function nearLimit(perTxNear: string, dailyNear: string, cosignAboveNear: string | null = null): AssetLimit {
  return makeLimit('NEAR', perTxNear, dailyNear, cosignAboveNear, 24);
}

export const ONE_NEAR_RAW = ONE_NEAR;
