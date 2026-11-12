import 'dotenv/config';
import { loadConfig } from './config.js';
import { disconnectDb, getDb } from './db.js';
import { buildApp, buildServices } from './app.js';

async function connectWithRetry(attempts = 30): Promise<void> {
  const db = getDb();
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await db.$connect();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('database connection failed');
}

async function main(): Promise<void> {
  const config = loadConfig();
  await connectWithRetry();
  const db = getDb();
  const services = buildServices(config, db);

  if (config.seedDemo) {
    await services.vaults.ensureDemoVault();
  }

  const app = await buildApp(services);
  services.indexer.start();
  services.executor.start();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    services.indexer.stop();
    services.executor.stop();
    services.sse.closeAll();
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    {
      mode: config.nearNetwork,
      demoVaultId: config.demoVaultId,
      harnessEnabled: config.harnessEnabled,
      intentsEnabled: services.intents.enabled,
    },
    'AgentVault API ready',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
