import {
  assetDecimals,
  assetSymbol,
  formatUnits,
  type AgentStatus,
  type ReasonCode,
  type RequestStatus,
} from '@agentvault/shared';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function symbolOf(asset: string): string {
  if (asset === 'NEAR') return 'NEAR';
  return assetSymbol(asset);
}

export function decimalsOf(asset: string): number {
  return assetDecimals(asset);
}

/** Exact raw-unit formatting without floating point loss. */
export function amount(raw: string, asset: string, maxFractionDigits = 4): string {
  try {
    return formatUnits(raw, decimalsOf(asset), maxFractionDigits);
  } catch {
    return raw;
  }
}

export function amountWithSymbol(raw: string, asset: string, maxFractionDigits = 4): string {
  return `${amount(raw, asset, maxFractionDigits)} ${symbolOf(asset)}`;
}

export function usdHint(raw: string, asset: string): string | null {
  // Only used for the demo's stablecoin display; never presented as an oracle.
  if (asset.startsWith('ft:usdc') || asset.startsWith('ft:usdt')) {
    return `≈ $${amount(raw, asset, 2)}`;
  }
  return null;
}

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'slate';

export const TONE_CLASS: Record<Tone, string> = {
  green: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  red: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  blue: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  violet: 'border-violet-400/25 bg-violet-400/10 text-violet-300',
  slate: 'border-white/10 bg-white/[0.04] text-slate-300',
};

export function requestTone(status: RequestStatus | string): Tone {
  switch (status) {
    case 'COMPLETED':
    case 'APPROVED':
      return 'green';
    case 'AWAITING_EXECUTION':
    case 'EXECUTING':
      return 'blue';
    case 'PENDING_APPROVAL':
      return 'amber';
    case 'REJECTED_BY_OWNER':
    case 'FAILED':
    case 'EXPIRED':
      return 'red';
    case 'REJECTED':
      return 'red';
    default:
      return 'slate';
  }
}

export function requestLabel(status: RequestStatus | string): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'Needs co-sign';
    case 'REJECTED_BY_OWNER':
      return 'Owner rejected';
    case 'AWAITING_EXECUTION':
      return 'Awaiting payout';
    case 'COMPLETED':
      return 'Completed';
    case 'REJECTED':
      return 'Rejected';
    default:
      return status.replaceAll('_', ' ').toLowerCase();
  }
}

export function agentTone(status: AgentStatus | string): Tone {
  if (status === 'ACTIVE') return 'green';
  if (status === 'FROZEN') return 'amber';
  return 'red';
}

export function reasonTone(reason: ReasonCode | string | null | undefined): Tone {
  if (!reason) return 'slate';
  if (reason === 'TRANSFER_FAILED') return 'amber';
  return 'red';
}

export function isRejection(status: string): boolean {
  return ['REJECTED', 'FAILED', 'REJECTED_BY_OWNER', 'EXPIRED'].includes(status);
}

export function truncateMiddle(value: string | null | undefined, head = 10, tail = 8): string {
  if (!value) return '—';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

export function classForDecision(decision: string): Tone {
  if (decision === 'APPROVED' || decision === 'COMPLETED') return 'green';
  if (decision === 'PENDING_APPROVAL') return 'amber';
  if (decision === 'DUPLICATE') return 'blue';
  if (decision === 'REJECTED' || decision === 'TX_ERROR') return 'red';
  return 'slate';
}

/** Parse a human decimal into raw units; throws with a readable message. */
export function toRaw(input: string, decimals: number): string {
  const value = input.trim();
  if (!/^\d*(\.\d*)?$/.test(value) || value === '' || value === '.') {
    throw new Error('Enter a number');
  }
  const [whole = '0', frac = ''] = value.split('.');
  if (frac.length > decimals) {
    throw new Error(`Max ${decimals} decimal places`);
  }
  return (BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')).toString();
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
