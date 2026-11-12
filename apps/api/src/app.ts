import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import {
  addAgentSchema,
  fundQuoteSchema,
  harnessStartSchema,
  localActionSchema,
  paymentArgsSchema,
  registerVaultSchema,
  requestsQuerySchema,
  toPolicy,
} from '@agentvault/shared';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import type { Db } from './db.js';
import { AppError, parseInput, sendError } from './lib/errors.js';
import { SseHub } from './lib/sse.js';
import { ExecutorService } from './services/executor.js';
import { HarnessService } from './services/harness.js';
import { IndexerService } from './services/indexer.js';
import { IntentsService } from './services/intents.js';
import { VaultService } from './services/vault-service.js';

const createLocalVaultSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  ownerId: z.string().min(2).max(64).optional(),
  fundingNear: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  fundUsdc: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

const localFundSchema = z.object({
  asset: z.string().min(2).max(80),
  amount: z.string().regex(/^(0|[1-9]\d*)$/),
});

const setExecutorSchema = z.object({
  executorId: z.string().min(2).max(64).nullable(),
});

export interface AppServices {
  config: AppConfig;
  db: Db;
  sse: SseHub;
  vaults: VaultService;
  intents: IntentsService;
  harness: HarnessService;
  indexer: IndexerService;
  executor: ExecutorService;
}

export function buildServices(config: AppConfig, db: Db): AppServices {
  const sse = new SseHub();
  const vaults = new VaultService(config, db, sse);
  const intents = new IntentsService(config);
  const harness = new HarnessService(config, db, vaults, sse);
  const indexer = new IndexerService(config, db, vaults, sse);
  const executor = new ExecutorService(config, db, vaults, intents, sse);
  return { config, db, sse, vaults, intents, harness, indexer, executor };
}

export async function buildApp(services: AppServices): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: services.config.logLevel,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.privateKey',
        '*.private_key',
        '*.AGENT_PRIVATE_KEY',
      ],
    },
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (
        services.config.corsOrigins.includes(origin) ||
        services.config.corsOrigins.includes('*')
      ) {
        return callback(null, true);
      }
      return callback(new Error(`origin ${origin} is not allowed`), false);
    },
    credentials: false,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => req.url.startsWith('/vaults/') && req.url.endsWith('/stream'),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      sendError(reply, error);
      return;
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'too many requests; slow down' },
      });
      return;
    }
    request.log.error({ err: error }, 'request failed');
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          services.config.nodeEnv === 'production'
            ? 'internal error'
            : error instanceof Error
              ? error.message
              : String(error),
      },
    });
  });

  app.get('/', async () => ({
    name: 'AgentVault API',
    version: '1.0.0',
    docs: '/health',
    mode: services.config.nearNetwork,
  }));

  app.get('/health', async () => services.vaults.health());

  // ---------------------------------------------------------------------
  // Vault registration and reads
  // ---------------------------------------------------------------------

  app.post('/vaults', async (request, reply) => {
    const body = parseInput(registerVaultSchema, request.body);
    const summary = await services.vaults.registerNearVault(body.vaultId, body.label ?? null);
    reply.status(201).send(summary);
  });

  app.post('/local/vaults', async (request, reply) => {
    const body = parseInput(createLocalVaultSchema, request.body ?? {});
    const summary = await services.vaults.createLocalVault(body);
    reply.status(201).send(summary);
  });

  app.get('/vaults', async (request) => {
    const query = request.query as { owner?: string };
    return { items: await services.vaults.listVaults(query.owner) };
  });

  app.get('/vaults/:id/summary', async (request) => {
    const { id } = request.params as { id: string };
    return services.vaults.summary(id);
  });

  app.get('/vaults/:id/agents', async (request) => {
    const { id } = request.params as { id: string };
    return { items: await services.vaults.agents(id) };
  });

  app.get('/vaults/:id/agents/:pk', async (request) => {
    const { id, pk } = request.params as { id: string; pk: string };
    const agent = await services.vaults.agent(id, decodeURIComponent(pk));
    if (!agent) throw new AppError('NOT_FOUND', 'agent not found', 404);
    return agent;
  });

  app.get('/vaults/:id/agents/:pk/budget', async (request) => {
    const { id, pk } = request.params as { id: string; pk: string };
    const budget = await services.vaults.budget(id, decodeURIComponent(pk));
    if (!budget) throw new AppError('NOT_FOUND', 'budget not found', 404);
    return budget;
  });

  app.get('/vaults/:id/requests', async (request) => {
    const { id } = request.params as { id: string };
    const query = parseInput(requestsQuerySchema, request.query);
    return services.vaults.requests(id, query);
  });

  app.get('/vaults/:id/requests/:requestId', async (request) => {
    const { id, requestId } = request.params as { id: string; requestId: string };
    const numeric = Number(requestId);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new AppError('VALIDATION_ERROR', 'request id must be a positive integer', 400);
    }
    const found = await services.vaults.request(id, numeric);
    if (!found) throw new AppError('NOT_FOUND', 'request not found', 404);
    return found;
  });

  app.get('/vaults/:id/approvals', async (request) => {
    const { id } = request.params as { id: string };
    return { items: await services.vaults.pendingRequests(id) };
  });

  app.get('/vaults/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    const vault = await services.db.vault.findUnique({ where: { id } });
    if (!vault) throw new AppError('NOT_FOUND', 'vault not found', 404);
    services.sse.subscribe(id, reply);
    return reply;
  });

  // ---------------------------------------------------------------------
  // Local demo mutations (no wallet; local mode is clearly labelled)
  // ---------------------------------------------------------------------

  app.post('/local/vaults/:id/agents', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = parseInput(addAgentSchema, request.body);
    const result = await services.vaults.addLocalAgent(id, {
      name: body.name,
      policy: toPolicy(body.policy),
      allowanceYocto: body.allowanceYocto,
    });
    reply.status(201).send(result);
  });

  app.post('/local/vaults/:id/agents/:pk/requests', async (request) => {
    const { id, pk } = request.params as { id: string; pk: string };
    const body = parseInput(paymentArgsSchema, request.body);
    return services.vaults.localPayment(id, decodeURIComponent(pk), body);
  });

  app.post('/local/vaults/:id/actions', async (request) => {
    const { id } = request.params as { id: string };
    const action = parseInput(localActionSchema, request.body);
    if (action.type === 'add_agent') {
      throw new AppError(
        'VALIDATION_ERROR',
        'use POST /local/vaults/:id/agents to add an agent',
        400,
      );
    }
    const normalized =
      action.type === 'update_policy'
        ? { ...action, policy: toPolicy(action.policy) }
        : action;
    return services.vaults.localAction(id, normalized);
  });

  app.post('/local/vaults/:id/fund', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseInput(localFundSchema, request.body);
    await services.vaults.localFund(id, body.asset, body.amount);
    return { ok: true };
  });

  app.post('/local/vaults/:id/executor', async (request) => {
    const { id } = request.params as { id: string };
    const body = parseInput(setExecutorSchema, request.body);
    return services.vaults.localAction(id, { type: 'set_executor', executorId: body.executorId });
  });

  // ---------------------------------------------------------------------
  // Harness
  // ---------------------------------------------------------------------

  app.post(
    '/harness/runs',
    {
      config: {
        rateLimit: {
          max: services.config.harnessPerHour,
          timeWindow: '1 hour',
        },
      },
    },
    async (request, reply) => {
      const body = parseInput(harnessStartSchema, request.body ?? {});
      const vaultId = body.vaultId ?? services.config.demoVaultId;
      const run = await services.harness.start(vaultId, request.ip);
      reply.status(202).send(run);
    },
  );

  app.get('/harness/runs/latest', async (request) => {
    const query = request.query as { vaultId?: string };
    return services.harness.latest(query.vaultId ?? services.config.demoVaultId);
  });

  app.get('/harness/runs/:runId', async (request) => {
    const { runId } = request.params as { runId: string };
    const run = await services.vaults.harnessRun(runId);
    if (!run) throw new AppError('NOT_FOUND', 'harness run not found', 404);
    return run;
  });

  app.get('/harness/runs/:runId/stream', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await services.db.harnessRun.findUnique({ where: { id: runId } });
    if (!run) throw new AppError('NOT_FOUND', 'harness run not found', 404);
    services.sse.subscribe(run.vaultId, reply);
    return reply;
  });

  app.get('/vaults/:id/harness', async (request) => {
    const { id } = request.params as { id: string };
    return { items: await services.vaults.harnessRuns(id) };
  });

  // ---------------------------------------------------------------------
  // NEAR Intents
  // ---------------------------------------------------------------------

  app.get('/intents/config', async () => ({
    enabled: services.intents.enabled,
    mainnetOnly: true,
    message: services.intents.enabled
      ? '1-Click quotes are proxied by this API; the JWT never reaches the browser.'
      : 'Set ONECLICK_API_URL (and optionally ONECLICK_JWT) to enable cross-chain funding and payouts.',
  }));

  app.post('/intents/fund-quote', async (request) => {
    const body = parseInput(fundQuoteSchema, request.body);
    return services.intents.quote({
      vaultId: body.vaultId,
      originAsset: body.originAsset,
      destinationAsset: body.destinationAsset,
      amount: body.amount,
      refundTo: body.refundTo,
    });
  });

  app.get('/intents/status', async (request) => {
    const query = request.query as { depositAddress?: string };
    if (!query.depositAddress) {
      throw new AppError('VALIDATION_ERROR', 'depositAddress is required', 400);
    }
    return services.intents.status(query.depositAddress);
  });

  app.get('/intents/tokens', async () => services.intents.tokens());

  return app;
}
