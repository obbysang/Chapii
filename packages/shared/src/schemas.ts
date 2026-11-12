import { z } from 'zod';
import { REQUEST_STATUSES } from './types.js';
import { REASON_CODES } from './reason-codes.js';

export const u128String = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'must be a non-negative integer string')
  .refine((v) => {
    try {
      return BigInt(v) <= 340282366920938463463374607431768211455n;
    } catch {
      return false;
    }
  }, 'must fit in u128');

export const positiveU128String = u128String.refine((v) => v !== '0', 'must be > 0');

export const assetSchema = z
  .string()
  .min(2)
  .max(80)
  .refine(
    (v) => v === 'NEAR' || /^ft:[a-z0-9][a-z0-9._-]{1,63}$/.test(v),
    'asset must be "NEAR" or "ft:<account_id>"',
  );

export const chainSchema = z
  .string()
  .min(2)
  .max(16)
  .regex(/^[a-z0-9-]+$/, 'chain must be lowercase [a-z0-9-]');

export const clientRefSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'client_ref must be 1..=64 chars of [A-Za-z0-9_-]');

export const paymentArgsSchema = z.strictObject({
  client_ref: clientRefSchema,
  asset: assetSchema,
  amount: positiveU128String,
  chain: chainSchema,
  address: z.string().min(1).max(128),
  dest_asset: z.string().min(1).max(64).nullish(),
  memo: z.string().max(140).nullish(),
});

export const assetLimitSchema = z
  .object({
    asset: assetSchema,
    per_tx_max: positiveU128String,
    daily_max: positiveU128String,
    cosign_above: positiveU128String.nullish(),
  })
  .refine((v) => BigInt(v.daily_max) >= BigInt(v.per_tx_max), {
    message: 'daily_max must be >= per_tx_max',
    path: ['daily_max'],
  })
  .refine((v) => !v.cosign_above || BigInt(v.cosign_above) <= BigInt(v.per_tx_max), {
    message: 'cosign_above must be <= per_tx_max',
    path: ['cosign_above'],
  });

export const payeeSchema = z.object({
  label: z.string().min(1).max(40),
  chain: chainSchema,
  address: z.string().min(1).max(128),
  allowed_dest_assets: z.array(z.string().min(1).max(64)).max(20).default([]),
});

export const policySchema = z
  .object({
    limits: z.array(assetLimitSchema).min(1).max(8),
    payees: z.array(payeeSchema).max(50),
    max_requests_per_hour: z.number().int().min(1).max(200),
    freeze_after_violations: z.number().int().min(0).max(20),
    expires_at_ns: z.number().int().nonnegative().nullish(),
  })
  .superRefine((policy, ctx) => {
    const assets = new Set<string>();
    for (const [i, limit] of policy.limits.entries()) {
      if (assets.has(limit.asset)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate asset in limits',
          path: ['limits', i, 'asset'],
        });
      }
      assets.add(limit.asset);
    }
    const seen = new Set<string>();
    for (const [i, payee] of policy.payees.entries()) {
      const key = `${payee.chain}:${payee.address}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate payee (chain + address)',
          path: ['payees', i, 'address'],
        });
      }
      seen.add(key);
    }
  });

export const addAgentSchema = z.object({
  name: z.string().min(1).max(40),
  /** Optional for the local simulator, which generates the key server-side. */
  publicKey: z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/, 'invalid ed25519 key').optional(),
  policy: policySchema,
  allowanceYocto: u128String.optional(),
});

export const createVaultSchema = z.object({
  vaultId: z.string().min(2).max(64),
  label: z.string().max(64).nullish(),
});

export const registerVaultSchema = z.object({
  vaultId: z.string().min(2).max(64),
  label: z.string().max(64).nullish(),
});

export const localActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('unpause') }),
  z.object({ type: z.literal('freeze_agent'), publicKey: z.string() }),
  z.object({ type: z.literal('unfreeze_agent'), publicKey: z.string() }),
  z.object({ type: z.literal('revoke_agent'), publicKey: z.string() }),
  z.object({ type: z.literal('update_policy'), publicKey: z.string(), policy: policySchema }),
  z.object({ type: z.literal('approve_request'), requestId: z.number().int().positive() }),
  z.object({ type: z.literal('reject_request'), requestId: z.number().int().positive() }),
  z.object({ type: z.literal('set_executor'), executorId: z.string().nullable() }),
  z.object({ type: z.literal('add_agent'), name: z.string().min(1).max(40), policy: policySchema }),
  z.object({
    type: z.literal('withdraw'),
    asset: assetSchema,
    amount: positiveU128String,
    to: z.string().min(1).max(128),
  }),
]);

export const requestsQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(REQUEST_STATUSES).optional(),
  agent: z.string().optional(),
  reason: z.enum(REASON_CODES).optional(),
  q: z.string().max(80).optional(),
});

export const fundQuoteSchema = z.object({
  vaultId: z.string().min(2).max(64),
  originAsset: z.string().min(1).max(80),
  destinationAsset: z.string().min(1).max(80),
  amount: positiveU128String,
  refundTo: z.string().max(64).optional(),
});

export const harnessStartSchema = z.object({
  vaultId: z.string().min(2).max(64).optional(),
});

export type PaymentArgsInput = z.infer<typeof paymentArgsSchema>;
export type PolicyInput = z.infer<typeof policySchema>;
export type AddAgentInput = z.infer<typeof addAgentSchema>;
export type LocalActionInput = z.infer<typeof localActionSchema>;

/** Narrow a validated policy input into the contract-shaped Policy type. */
export function toPolicy(input: PolicyInput): import('./types.js').Policy {
  return {
    limits: input.limits.map((limit) => ({
      asset: limit.asset,
      per_tx_max: limit.per_tx_max,
      daily_max: limit.daily_max,
      cosign_above: limit.cosign_above ?? null,
    })),
    payees: input.payees.map((payee) => ({
      label: payee.label,
      chain: payee.chain,
      address: payee.address,
      allowed_dest_assets: payee.allowed_dest_assets ?? [],
    })),
    max_requests_per_hour: input.max_requests_per_hour,
    freeze_after_violations: input.freeze_after_violations,
    expires_at_ns: input.expires_at_ns ?? null,
  };
}
