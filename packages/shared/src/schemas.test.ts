import { describe, expect, it } from 'vitest';
import { paymentArgsSchema, policySchema } from './schemas.js';

const basePolicy = {
  limits: [
    {
      asset: 'NEAR',
      per_tx_max: '5000000000000000000000000',
      daily_max: '20000000000000000000000000',
      cosign_above: null,
    },
  ],
  payees: [{ label: 'Merchant', chain: 'near', address: 'merchant.testnet', allowed_dest_assets: [] }],
  max_requests_per_hour: 10,
  freeze_after_violations: 3,
  expires_at_ns: null,
};

describe('policySchema', () => {
  it('accepts a conservative policy', () => {
    expect(policySchema.safeParse(basePolicy).success).toBe(true);
  });

  it('rejects a co-sign threshold above the per-transaction cap', () => {
    const invalid = {
      ...basePolicy,
      limits: [
        {
          ...basePolicy.limits[0],
          cosign_above: '6000000000000000000000000',
        },
      ],
    };
    expect(policySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a daily cap below the per-transaction cap', () => {
    const invalid = {
      ...basePolicy,
      limits: [{ ...basePolicy.limits[0], daily_max: '1' }],
    };
    expect(policySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects duplicate payees', () => {
    const invalid = {
      ...basePolicy,
      payees: [...basePolicy.payees, ...basePolicy.payees],
    };
    expect(policySchema.safeParse(invalid).success).toBe(false);
  });
});

describe('paymentArgsSchema', () => {
  it('accepts raw-unit payments', () => {
    const result = paymentArgsSchema.safeParse({
      client_ref: 'invoice-2026-0042',
      asset: 'ft:usdc.testnet',
      amount: '5000000',
      chain: 'near',
      address: 'merchant.testnet',
    });
    expect(result.success).toBe(true);
  });

  it('rejects human decimal amounts and unsafe client refs', () => {
    expect(
      paymentArgsSchema.safeParse({
        client_ref: 'invoice with spaces',
        asset: 'NEAR',
        amount: '1.5',
        chain: 'near',
        address: 'merchant.testnet',
      }).success,
    ).toBe(false);
  });
});
