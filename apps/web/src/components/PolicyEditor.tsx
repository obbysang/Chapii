import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import {
  assetDecimals,
  formatUnits,
  makeLimit,
  normalizePayee,
  summarisePolicy,
  validatePayeeAddress,
  type Policy,
} from '@agentvault/shared';
import { Button, Field, Input, Select } from './ui';
import { amount } from '../lib/utils';

interface LimitForm {
  asset: string;
  perTx: string;
  daily: string;
  cosign: string;
}

interface PayeeForm {
  label: string;
  chain: string;
  address: string;
  dest: string;
}

interface FormState {
  limits: LimitForm[];
  payees: PayeeForm[];
  maxRequests: string;
  freezeAfter: string;
}

function human(raw: string, asset: string): string {
  try {
    return formatUnits(raw, assetDecimals(asset), assetDecimals(asset)).replaceAll(',', '');
  } catch {
    return '0';
  }
}

function toForm(policy: Policy): FormState {
  return {
    limits: policy.limits.map((limit) => ({
      asset: limit.asset,
      perTx: human(limit.per_tx_max, limit.asset),
      daily: human(limit.daily_max, limit.asset),
      cosign: limit.cosign_above ? human(limit.cosign_above, limit.asset) : '',
    })),
    payees: policy.payees.map((payee) => ({
      label: payee.label,
      chain: payee.chain,
      address: payee.address,
      dest: payee.allowed_dest_assets.join(', '),
    })),
    maxRequests: String(policy.max_requests_per_hour),
    freezeAfter: String(policy.freeze_after_violations),
  };
}

export const ASSET_CHOICES = ['NEAR', 'ft:usdc.testnet', 'ft:usdt.testnet'];

export function defaultPolicy(): Policy {
  const near = makeLimit('NEAR', '5', '20', '4', 24);
  return {
    limits: [near],
    payees: [
      {
        label: 'Acme API',
        chain: 'near',
        address: 'merchant.testnet',
        allowed_dest_assets: [],
      },
    ],
    max_requests_per_hour: 12,
    freeze_after_violations: 3,
    expires_at_ns: null,
  };
}

export function PolicyEditor({
  initial,
  onChange,
}: {
  initial?: Policy;
  onChange: (policy: Policy | null, error: string | null) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(initial ?? defaultPolicy()));

  const built = useMemo(() => {
    if (form.limits.length === 0) return { policy: null, error: 'Add at least one asset limit' };
    const seen = new Set<string>();
    for (const limit of form.limits) {
      if (seen.has(limit.asset)) return { policy: null, error: `Duplicate limit for ${limit.asset}` };
      seen.add(limit.asset);
      const decimals = assetDecimals(limit.asset);
      if (!limit.perTx.trim() || !limit.daily.trim()) {
        return { policy: null, error: `Enter per-payment and daily limits for ${limit.asset}` };
      }
      try {
        const perTx = makeLimit(limit.asset, limit.perTx, limit.daily, limit.cosign || null, decimals);
        if (BigInt(perTx.daily_max) < BigInt(perTx.per_tx_max)) {
          return {
            policy: null,
            error: `Daily limit must be at least the per-payment limit for ${limit.asset}`,
          };
        }
        if (perTx.cosign_above && BigInt(perTx.cosign_above) > BigInt(perTx.per_tx_max)) {
          return { policy: null, error: 'Co-sign threshold cannot exceed the per-payment limit' };
        }
      } catch (error) {
        return {
          policy: null,
          error: error instanceof Error ? error.message : 'Invalid amount',
        };
      }
    }
    for (const payee of form.payees) {
      if (!payee.label.trim() || !payee.address.trim()) {
        return { policy: null, error: 'Each allowlisted payee needs a label and address' };
      }
      const invalid = validatePayeeAddress(payee.chain, payee.address);
      if (invalid) return { policy: null, error: `${payee.label}: ${invalid}` };
    }
    const maxRequests = Number(form.maxRequests);
    if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 200) {
      return { policy: null, error: 'Requests per hour must be between 1 and 200' };
    }
    const freezeAfter = Number(form.freezeAfter);
    if (!Number.isInteger(freezeAfter) || freezeAfter < 0 || freezeAfter > 20) {
      return { policy: null, error: 'Freeze threshold must be between 0 and 20' };
    }

    const policy: Policy = {
      limits: form.limits.map((limit) =>
        makeLimit(
          limit.asset,
          limit.perTx,
          limit.daily,
          limit.cosign || null,
          assetDecimals(limit.asset),
        ),
      ),
      payees: form.payees.map((payee) =>
        normalizePayee({
          label: payee.label.trim(),
          chain: payee.chain,
          address: payee.address.trim(),
          allowed_dest_assets: payee.dest
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      ),
      max_requests_per_hour: maxRequests,
      freeze_after_violations: freezeAfter,
      expires_at_ns: initial?.expires_at_ns ?? null,
    };
    return { policy, error: null };
  }, [form, initial?.expires_at_ns]);

  const { policy: builtPolicy, error: builtError } = built;
  useEffect(() => {
    onChange(builtPolicy, builtError);
  }, [builtPolicy, builtError, onChange]);

  const updateLimit = (index: number, patch: Partial<LimitForm>) => {
    setForm((current) => ({
      ...current,
      limits: current.limits.map((limit, i) => (i === index ? { ...limit, ...patch } : limit)),
    }));
  };

  const updatePayee = (index: number, patch: Partial<PayeeForm>) => {
    setForm((current) => ({
      ...current,
      payees: current.payees.map((payee, i) => (i === index ? { ...payee, ...patch } : payee)),
    }));
  };

  const summary = builtPolicy ? summarisePolicy(builtPolicy) : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Spending limits</p>
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={() =>
              setForm((current) => ({
                ...current,
                limits: [
                  ...current.limits,
                  {
                    asset:
                      ASSET_CHOICES.find(
                        (asset) => !current.limits.some((limit) => limit.asset === asset),
                      ) ?? 'NEAR',
                    perTx: '10',
                    daily: '50',
                    cosign: '',
                  },
                ],
              }))
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add asset
          </Button>
        </div>
        <div className="space-y-2.5">
          {form.limits.map((limit, index) => (
            <div
              key={`${limit.asset}-${index}`}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <Select
                  value={limit.asset}
                  onChange={(event) => updateLimit(index, { asset: event.target.value })}
                  className="max-w-[220px]"
                  aria-label="Asset"
                >
                  {ASSET_CHOICES.map((asset) => (
                    <option key={asset} value={asset}>
                      {asset === 'NEAR'
                        ? 'NEAR'
                        : asset.replace('ft:', '').replace('.testnet', '').toUpperCase()}
                    </option>
                  ))}
                </Select>
                <span className="text-[11px] text-slate-500">{limit.asset}</span>
                {form.limits.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        limits: current.limits.filter((_, i) => i !== index),
                      }))
                    }
                    className="ml-auto rounded p-1.5 text-slate-500 transition hover:text-rose-300"
                    aria-label="Remove asset limit"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Per payment">
                  <Input
                    value={limit.perTx}
                    inputMode="decimal"
                    onChange={(event) => updateLimit(index, { perTx: event.target.value })}
                    placeholder="5"
                  />
                </Field>
                <Field label="Daily cap">
                  <Input
                    value={limit.daily}
                    inputMode="decimal"
                    onChange={(event) => updateLimit(index, { daily: event.target.value })}
                    placeholder="20"
                  />
                </Field>
                <Field label="Co-sign above" hint="Blank = never">
                  <Input
                    value={limit.cosign}
                    inputMode="decimal"
                    onChange={(event) => updateLimit(index, { cosign: event.target.value })}
                    placeholder="optional"
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Allowlisted payees</p>
          <Button
            type="button"
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={() =>
              setForm((current) => ({
                ...current,
                payees: [...current.payees, { label: '', chain: 'near', address: '', dest: '' }],
              }))
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add payee
          </Button>
        </div>
        {form.payees.length === 0 ? (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-200">
            An agent with no allowlisted payees can only ever produce blocked requests. Add at
            least one recipient before the agent goes live.
          </div>
        ) : null}
        <div className="space-y-2.5">
          {form.payees.map((payee, index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  value={payee.label}
                  onChange={(event) => updatePayee(index, { label: event.target.value })}
                  placeholder="Label, e.g. Acme API"
                  className="max-w-[220px]"
                />
                <Select
                  value={payee.chain}
                  onChange={(event) => updatePayee(index, { chain: event.target.value })}
                  className="max-w-[130px]"
                  aria-label="Chain"
                >
                  <option value="near">NEAR</option>
                  <option value="base">Base</option>
                  <option value="eth">Ethereum</option>
                  <option value="arb">Arbitrum</option>
                  <option value="sol">Solana</option>
                </Select>
                <button
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      payees: current.payees.filter((_, i) => i !== index),
                    }))
                  }
                  className="ml-auto rounded p-1.5 text-slate-500 transition hover:text-rose-300"
                  aria-label="Remove payee"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Address">
                  <Input
                    value={payee.address}
                    onChange={(event) => updatePayee(index, { address: event.target.value })}
                    placeholder={payee.chain === 'near' ? 'merchant.testnet' : '0x…'}
                    className="mono"
                  />
                </Field>
                <Field label="Allowed destination assets" hint="Comma-separated, e.g. USDC">
                  <Input
                    value={payee.dest}
                    onChange={(event) => updatePayee(index, { dest: event.target.value })}
                    placeholder="optional"
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Requests per hour">
          <Input
            value={form.maxRequests}
            inputMode="numeric"
            onChange={(event) => setForm((current) => ({ ...current, maxRequests: event.target.value }))}
          />
        </Field>
        <Field label="Freeze after violations" hint="0 disables automatic freezing">
          <Input
            value={form.freezeAfter}
            inputMode="numeric"
            onChange={(event) => setForm((current) => ({ ...current, freezeAfter: event.target.value }))}
          />
        </Field>
      </div>

      {builtError ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.07] p-3 text-xs text-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{builtError}</span>
        </div>
      ) : summary ? (
        <div className="rounded-lg border border-sky-400/15 bg-sky-400/[0.05] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
            Plain-English policy
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{summary}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            Worst case daily outflow:{' '}
            <span className="font-medium text-slate-300">
              {builtPolicy?.limits
                .map(
                  (limit) =>
                    `${amount(limit.daily_max, limit.asset)} ${limit.asset
                      .replace('ft:', '')
                      .replace('.testnet', '')
                      .toUpperCase()}`,
                )
                .join(' + ')}
            </span>{' '}
            across {builtPolicy?.payees.length ?? 0} allowlisted payee(s).
          </p>
        </div>
      ) : null}
    </div>
  );
}
