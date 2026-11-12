import { DEFAULT_FT_DECIMALS, NEAR_DECIMALS, NETWORKS } from './constants.js';

export function isNearAsset(asset: string): boolean {
  return asset === 'NEAR';
}

export function ftAccountId(asset: string): string | null {
  return asset.startsWith('ft:') ? asset.slice(3) : null;
}

export function assetDecimals(asset: string): number {
  return isNearAsset(asset) ? NEAR_DECIMALS : DEFAULT_FT_DECIMALS;
}

export function assetSymbol(asset: string, known: Record<string, string> = {}): string {
  if (isNearAsset(asset)) return 'NEAR';
  const id = ftAccountId(asset);
  if (!id) return asset;
  return known[id] ?? id.split('.')[0]!.toUpperCase();
}

/** Parse a human decimal string into the smallest unit (exact, no floats). */
export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    throw new Error(`Invalid amount: ${value}`);
  }
  const [whole = '0', frac = ''] = trimmed.split('.');
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** Format smallest units as a human decimal string, trimming trailing zeros. */
export function formatUnits(raw: bigint | string, decimals: number, maxFractionDigits = 6): string {
  const value = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFractionDigits);
  fracStr = fracStr.replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US');
  return `${negative ? '-' : ''}${wholeStr}${fracStr ? `.${fracStr}` : ''}`;
}

export function formatAmount(
  raw: string,
  asset: string,
  opts: { decimals?: number; symbol?: string; maxFractionDigits?: number } = {},
): string {
  const decimals = opts.decimals ?? assetDecimals(asset);
  const symbol = opts.symbol ?? assetSymbol(asset);
  return `${formatUnits(raw, decimals, opts.maxFractionDigits ?? 4)} ${symbol}`;
}

export function shorten(value: string | null | undefined, head = 8, tail = 6): string {
  if (!value) return '—';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function explorerAccount(network: 'testnet' | 'mainnet', accountId: string): string {
  return `${NETWORKS[network].explorer}/address/${accountId}`;
}

export function explorerTx(network: 'testnet' | 'mainnet', txHash: string): string {
  return `${NETWORKS[network].explorer}/txns/${txHash}`;
}

export function relativeTime(iso: string | number | Date | null | undefined): string {
  if (!iso) return '—';
  const ts = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < 45_000) return diff >= 0 ? 'just now' : 'in a moment';
  if (abs < hour) return diff >= 0 ? `${Math.round(abs / minute)}m ago` : `in ${Math.round(abs / minute)}m`;
  if (abs < day) return diff >= 0 ? `${Math.round(abs / hour)}h ago` : `in ${Math.round(abs / hour)}h`;
  if (abs < 7 * day) return diff >= 0 ? `${Math.round(abs / day)}d ago` : `in ${Math.round(abs / day)}d`;
  return new Date(ts).toLocaleDateString();
}

export function timeLeft(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

/** Deterministic short reference for an agent request. */
export function makeClientRef(prefix = 'req'): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}-${rand}`;
}
