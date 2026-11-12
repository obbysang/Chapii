import { describe, expect, it } from 'vitest';
import type { Policy } from '@agentvault/shared';
import { LocalVault } from './engine.js';

const OWNER = 'owner.testnet';
const AGENT = 'ed25519:testagent';

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    limits: [
      {
        asset: 'NEAR',
        per_tx_max: '5000000000000000000000000',
        daily_max: '20000000000000000000000000',
        cosign_above: null,
      },
    ],
    payees: [
      { label: 'Merchant', chain: 'near', address: 'merchant.testnet', allowed_dest_assets: [] },
    ],
    max_requests_per_hour: 10,
    freeze_after_violations: 3,
    expires_at_ns: null,
    ...overrides,
  };
}

function vault(): LocalVault {
  const created = LocalVault.create({
    vaultId: 'vault.testnet',
    ownerId: OWNER,
    balances: { NEAR: '1000000000000000000000000000' },
  });
  created.addAgent(OWNER, AGENT, 'Research', policy());
  return created;
}

describe('LocalVault policy engine', () => {
  it('approves an allowlisted payment within caps', () => {
    const local = vault();
    const decision = local.requestPayment(AGENT, {
      client_ref: 'ok-1',
      asset: 'NEAR',
      amount: '1000000000000000000000000',
      chain: 'near',
      address: 'merchant.testnet',
    });
    expect(decision.decision).toBe('APPROVED');
  });

  it('rejects an unknown payee and records the reason', () => {
    const local = vault();
    const decision = local.requestPayment(AGENT, {
      client_ref: 'bad-payee',
      asset: 'NEAR',
      amount: '1000000000000000000000000',
      chain: 'ethereum',
      address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    });
    expect(decision.decision).toBe('REJECTED');
    if (decision.decision === 'REJECTED') {
      expect(decision.data.reason).toBe('PAYEE_NOT_ALLOWED');
      expect(local.getRequest(decision.data.request_id)?.status).toBe('REJECTED');
    }
  });

  it('rejects an amount above the per-transaction cap', () => {
    const local = vault();
    const decision = local.requestPayment(AGENT, {
      client_ref: 'over-cap',
      asset: 'NEAR',
      amount: '6000000000000000000000000',
      chain: 'near',
      address: 'merchant.testnet',
    });
    expect(decision.decision).toBe('REJECTED');
    if (decision.decision === 'REJECTED') {
      expect(decision.data.reason).toBe('PER_TX_CAP_EXCEEDED');
    }
  });

  it('returns DUPLICATE for a reused client_ref', () => {
    const local = vault();
    const args = {
      client_ref: 'replay-me',
      asset: 'NEAR',
      amount: '1000000000000000000000000',
      chain: 'near',
      address: 'merchant.testnet',
    };
    expect(local.requestPayment(AGENT, args).decision).toBe('APPROVED');
    expect(local.requestPayment(AGENT, args).decision).toBe('DUPLICATE');
  });

  it('auto-freezes after the configured number of violations', () => {
    const local = vault();
    for (let i = 0; i < 3; i += 1) {
      const decision = local.requestPayment(AGENT, {
        client_ref: `attack-${i}`,
        asset: 'NEAR',
        amount: '1000000000000000000000000',
        chain: 'ethereum',
        address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });
      expect(decision.decision).toBe('REJECTED');
    }
    const after = local.requestPayment(AGENT, {
      client_ref: 'after-freeze',
      asset: 'NEAR',
      amount: '1000000000000000000000000',
      chain: 'near',
      address: 'merchant.testnet',
    });
    expect(after.decision).toBe('REJECTED');
    if (after.decision === 'REJECTED') expect(after.data.reason).toBe('AGENT_FROZEN');
  });
});
