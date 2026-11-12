#!/usr/bin/env node
import 'dotenv/config';
import { createRuntime, loadRuntimeConfig } from './backend.js';
import { runScriptedAttacker, runScriptedGood } from './scripted.js';

async function main(): Promise<void> {
  const mode = (process.argv[2] ?? 'good').toLowerCase();
  if (!['good', 'attack', 'llm'].includes(mode)) {
    console.error('Usage: node dist/run.js <good|attack|llm>');
    process.exit(2);
  }

  let config;
  try {
    config = loadRuntimeConfig();
  } catch (error) {
    console.error(
      `[demo-agent] configuration error: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(
      'Set VAULT_ACCOUNT_ID and AGENT_PRIVATE_KEY. For the local simulator also set AGENTVAULT_API_URL.',
    );
    process.exit(1);
    return;
  }

  const runtime = createRuntime(config);
  console.log(
    `[demo-agent] ${mode} mode · vault ${config.vaultId} · ${config.mode} · agent ${runtime.publicKey}`,
  );

  if (mode === 'llm') {
    const { runLlmAgent } = await import('./llm.js');
    await runLlmAgent(runtime);
    return;
  }

  if (mode === 'attack') {
    await runScriptedAttacker(runtime);
    return;
  }

  await runScriptedGood(runtime);
}

main().catch((error) => {
  console.error(
    `[demo-agent] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
});
