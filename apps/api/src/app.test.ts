import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, buildServices, type AppServices } from './app.js';
import { loadConfig, type AppConfig } from './config.js';
import { FakeDb } from './test/fake-db.js';

const config: AppConfig = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://agentvault:agentvault@localhost:5432/agentvault?schema=public',
  NEAR_NETWORK: 'local',
  LOCAL_MODE_ENABLED: 'true',
  SEED_DEMO: 'false',
  HARNESS_ENABLED: 'true',
  DEMO_VAULT_ID: 'demo.agentvault.testnet',
  DEMO_OWNER_ID: 'demo-owner.testnet',
});

const ONE_NEAR = '1000000000000000000000000';
const POLICY = {
  limits: [
    {
      asset: 'NEAR',
      per_tx_max: `${5n * BigInt(ONE_NEAR)}`,
      daily_max: `${20n * BigInt(ONE_NEAR)}`,
      cosign_above: `${4n * BigInt(ONE_NEAR)}`,
    },
  ],
  payees: [
    {
      label: 'merchant',
      chain: 'near',
      address: 'merchant.testnet',
      allowed_dest_assets: [],
    },
  ],
  max_requests_per_hour: 10,
  freeze_after_violations: 3,
  expires_at_ns: null,
};

let app: FastifyInstance;
let services: AppServices;
let db: FakeDb;

async function createVault(): Promise<{ vaultId: string; publicKey: string }> {
  const created = await app.inject({
    method: 'POST',
    url: '/local/vaults',
    payload: { label: 'Test vault', fundingNear: '50' },
  });
  expect(created.statusCode).toBe(201);
  const vaultId = created.json().vaultId as string;

  const agent = await app.inject({
    method: 'POST',
    url: `/local/vaults/${vaultId}/agents`,
    payload: { name: 'Research agent', policy: POLICY },
  });
  expect(agent.statusCode).toBe(201);
  return { vaultId, publicKey: agent.json().publicKey as string };
}

async function pay(vaultId: string, publicKey: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/local/vaults/${vaultId}/agents/${encodeURIComponent(publicKey)}/requests`,
    payload,
  });
}

beforeAll(async () => {
  db = new FakeDb();
  services = buildServices(config, db as unknown as AppServices['db']);
  app = await buildApp(services);
  await app.ready();
});

afterAll(async () => {
  services.sse.closeAll();
  await app.close();
});

describe('API basics', () => {
  it('serves service metadata', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'AgentVault API', mode: 'local' });
  });

  it('reports a healthy local stack', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      mode: 'local',
      db: 'ok',
      chain: 'ok',
      demoVaultId: 'demo.agentvault.testnet',
    });
  });
});

describe('local vault lifecycle', () => {
  it('creates a funded vault and exposes it in the list', async () => {
    const { vaultId } = await createVault();
    expect(vaultId).toMatch(/\.demo\.testnet$/);

    const list = await app.inject({ method: 'GET', url: '/vaults' });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.some((vault: { vaultId: string }) => vault.vaultId === vaultId)).toBe(true);

    const summary = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/summary` });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      vaultId,
      mode: 'local',
      ownerId: 'demo-owner.testnet',
      paused: false,
    });
    expect(
      summary.json().balances.some((balance: { asset: string }) => balance.asset === 'NEAR'),
    ).toBe(true);
  });

  it('returns 404 for an unknown vault', async () => {
    const response = await app.inject({ method: 'GET', url: '/vaults/nope.testnet/summary' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('rejects an invalid policy with a validation envelope', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/local/vaults',
      payload: { label: 'Bad' },
    });
    expect(response.statusCode).toBe(201);
    const vaultId = response.json().vaultId as string;
    const agent = await app.inject({
      method: 'POST',
      url: `/local/vaults/${vaultId}/agents`,
      payload: { name: '', policy: POLICY },
    });
    expect(agent.statusCode).toBe(400);
    expect(agent.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('policy enforcement over HTTP', () => {
  it('approves an allowlisted payment and records it', async () => {
    const { vaultId, publicKey } = await createVault();
    const response = await pay(vaultId, publicKey, {
      client_ref: `ok-${Date.now().toString(36)}`,
      asset: 'NEAR',
      amount: ONE_NEAR,
      chain: 'near',
      address: 'merchant.testnet',
      memo: 'API usage',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(['APPROVED', 'COMPLETED']).toContain(body.decision);
    expect(body.requestId).toBeGreaterThan(0);

    const requests = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/requests` });
    expect(requests.statusCode).toBe(200);
    const items = requests.json().items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      address: 'merchant.testnet',
      memo: 'API usage',
      asset: 'NEAR',
    });
    expect(String(items[0].clientRef)).toMatch(/^ok-/);
    expect(items[0].amount).toBe(ONE_NEAR);

    const detail = await app.inject({
      method: 'GET',
      url: `/vaults/${vaultId}/requests/${body.requestId}`,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().id).toBe(items[0].id);

    const summary = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/summary` });
    expect(summary.statusCode, summary.body).toBe(200);
    expect(summary.json().stats24h.approved).toBe(1);
  });

  it('rejects a payee that is not on the allowlist', async () => {
    const { vaultId, publicKey } = await createVault();
    const response = await pay(vaultId, publicKey, {
      client_ref: `bad-${Date.now().toString(36)}`,
      asset: 'NEAR',
      amount: ONE_NEAR,
      chain: 'near',
      address: 'attacker.testnet',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ decision: 'REJECTED', reason: 'PAYEE_NOT_ALLOWED' });

    const requests = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/requests` });
    expect(requests.json().items[0]).toMatchObject({
      status: 'REJECTED',
      reason: 'PAYEE_NOT_ALLOWED',
    });

    const summary = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/summary` });
    expect(summary.json().stats24h.rejected).toBe(1);
  });

  it('treats a repeated client_ref as a duplicate, not a second payment', async () => {
    const { vaultId, publicKey } = await createVault();
    const payload = {
      client_ref: `dup-${Date.now().toString(36)}`,
      asset: 'NEAR',
      amount: ONE_NEAR,
      chain: 'near',
      address: 'merchant.testnet',
    };
    const first = await pay(vaultId, publicKey, payload);
    const second = await pay(vaultId, publicKey, payload);
    expect(first.json().decision).not.toBe('DUPLICATE');
    expect(second.json().decision).toBe('DUPLICATE');
    expect(second.json().requestId).toBe(first.json().requestId);

    const requests = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/requests` });
    expect(requests.json().items).toHaveLength(1);
  });

  it('blocks every payment once the vault is paused', async () => {
    const { vaultId, publicKey } = await createVault();
    const paused = await app.inject({
      method: 'POST',
      url: `/local/vaults/${vaultId}/actions`,
      payload: { type: 'pause' },
    });
    expect(paused.statusCode).toBe(200);

    const response = await pay(vaultId, publicKey, {
      client_ref: `paused-${Date.now().toString(36)}`,
      asset: 'NEAR',
      amount: ONE_NEAR,
      chain: 'near',
      address: 'merchant.testnet',
    });
    expect(response.json()).toMatchObject({ decision: 'REJECTED', reason: 'VAULT_PAUSED' });
  });

  it('sends a payment above the co-sign threshold to owner approval', async () => {
    const { vaultId, publicKey } = await createVault();
    const response = await pay(vaultId, publicKey, {
      client_ref: `cosign-${Date.now().toString(36)}`,
      asset: 'NEAR',
      amount: `${5n * BigInt(ONE_NEAR)}`,
      chain: 'near',
      address: 'merchant.testnet',
    });
    expect(response.json()).toMatchObject({
      decision: 'PENDING_APPROVAL',
      status: 'PENDING_APPROVAL',
    });

    const approvals = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/approvals` });
    expect(approvals.json().items).toHaveLength(1);

    const requestId = response.json().requestId as number;
    const approved = await app.inject({
      method: 'POST',
      url: `/local/vaults/${vaultId}/actions`,
      payload: { type: 'approve_request', requestId },
    });
    expect(approved.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/approvals` });
    expect(after.json().items).toHaveLength(0);
  });
});

describe('agent reads', () => {
  it('lists agents with their policy and budget', async () => {
    const { vaultId, publicKey } = await createVault();
    const agents = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/agents` });
    expect(agents.statusCode).toBe(200);
    expect(agents.json().items).toHaveLength(1);
    expect(agents.json().items[0]).toMatchObject({ publicKey, name: 'Research agent', status: 'ACTIVE' });

    const budget = await app.inject({
      method: 'GET',
      url: `/vaults/${vaultId}/agents/${encodeURIComponent(publicKey)}/budget`,
    });
    expect(budget.statusCode).toBe(200);
    expect(budget.json().per_asset[0]).toMatchObject({ asset: 'NEAR' });
  });

  it('returns 404 for an unknown agent', async () => {
    const { vaultId } = await createVault();
    const response = await app.inject({
      method: 'GET',
      url: `/vaults/${vaultId}/agents/ed25519:unknown`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('error handling', () => {
  it('rejects an unknown payment id with 404', async () => {
    const { vaultId } = await createVault();
    const response = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/requests/999` });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed request body', async () => {
    const { vaultId, publicKey } = await createVault();
    const response = await pay(vaultId, publicKey, { client_ref: 'bad ref!' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('never leaks a private key in agent listings', async () => {
    const { vaultId } = await createVault();
    const response = await app.inject({ method: 'GET', url: `/vaults/${vaultId}/agents` });
    expect(JSON.stringify(response.json())).not.toContain('privateKey');
  });
});
