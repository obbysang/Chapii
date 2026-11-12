import { z } from 'zod';

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

// Docker Compose sets optional vars to an empty string when they are unset in
// `.env` (`${VAR:-}`). Treat that as absent so `.url()` / `.optional()` work.
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .default('postgresql://agentvault:agentvault@localhost:5432/agentvault?schema=public'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8080'),
  NEAR_NETWORK: z.enum(['local', 'testnet', 'mainnet']).default('local'),
  NEAR_RPC_URL: optionalUrl,
  INDEXER_POLL_MS: z.coerce.number().int().min(500).max(60_000).default(2500),
  LOCAL_MODE_ENABLED: z.string().optional(),
  SEED_DEMO: z.string().optional(),
  DEMO_VAULT_ID: z.string().default('demo.agentvault.testnet'),
  DEMO_OWNER_ID: z.string().default('demo-owner.testnet'),
  DEMO_FUNDING_NEAR: z.string().default('250'),
  HARNESS_ENABLED: z.string().optional(),
  HARNESS_PER_HOUR: z.coerce.number().int().min(1).max(100).default(3),
  HARNESS_OWNER_ACCOUNT_ID: optionalString,
  HARNESS_OWNER_PRIVATE_KEY: optionalString,
  EXECUTOR_ACCOUNT_ID: optionalString,
  EXECUTOR_PRIVATE_KEY: optionalString,
  ONECLICK_API_URL: optionalUrl,
  ONECLICK_JWT: optionalString,
  EXECUTOR_POLL_MS: z.coerce.number().int().min(1000).max(120_000).default(5000),
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  corsOrigins: string[];
  nearNetwork: 'local' | 'testnet' | 'mainnet';
  nearRpcUrl: string;
  indexerPollMs: number;
  localModeEnabled: boolean;
  seedDemo: boolean;
  demoVaultId: string;
  demoOwnerId: string;
  demoFundingNear: string;
  harnessEnabled: boolean;
  harnessPerHour: number;
  harnessOwnerAccountId?: string;
  harnessOwnerPrivateKey?: string;
  executorAccountId?: string;
  executorPrivateKey?: string;
  oneClickApiUrl?: string;
  oneClickJwt?: string;
  executorPollMs: number;
};

const RPC = {
  testnet: 'https://rpc.testnet.near.org',
  mainnet: 'https://rpc.mainnet.near.org',
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const isLocal = parsed.NEAR_NETWORK === 'local';
  if (parsed.NEAR_NETWORK === 'mainnet' && parsed.HARNESS_ENABLED && bool(parsed.HARNESS_ENABLED, false)) {
    throw new Error('HARNESS_ENABLED must be false on mainnet');
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    nearNetwork: parsed.NEAR_NETWORK,
    nearRpcUrl:
      parsed.NEAR_RPC_URL ??
      (parsed.NEAR_NETWORK === 'mainnet' ? RPC.mainnet : RPC.testnet),
    indexerPollMs: parsed.INDEXER_POLL_MS,
    localModeEnabled: bool(parsed.LOCAL_MODE_ENABLED, isLocal),
    seedDemo: bool(parsed.SEED_DEMO, isLocal),
    demoVaultId: parsed.DEMO_VAULT_ID,
    demoOwnerId: parsed.DEMO_OWNER_ID,
    demoFundingNear: parsed.DEMO_FUNDING_NEAR,
    harnessEnabled: bool(parsed.HARNESS_ENABLED, isLocal),
    harnessPerHour: parsed.HARNESS_PER_HOUR,
    harnessOwnerAccountId: parsed.HARNESS_OWNER_ACCOUNT_ID,
    harnessOwnerPrivateKey: parsed.HARNESS_OWNER_PRIVATE_KEY,
    executorAccountId: parsed.EXECUTOR_ACCOUNT_ID,
    executorPrivateKey: parsed.EXECUTOR_PRIVATE_KEY,
    oneClickApiUrl: parsed.ONECLICK_API_URL?.replace(/\/+$/, ''),
    oneClickJwt: parsed.ONECLICK_JWT,
    executorPollMs: parsed.EXECUTOR_POLL_MS,
  };
}
