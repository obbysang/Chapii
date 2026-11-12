import type { PaymentRequest, Policy } from '@agentvault/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db.js';
import type { SseHub } from '../lib/sse.js';
import type { VaultService } from './vault-service.js';

interface VaultCursor {
  backoffMs: number;
  nextAgentPoll: number;
  nextBalancePoll: number;
}

/**
 * Incremental indexer for real NEAR vaults. The database is a read-model only;
 * chain state remains authoritative. Failures degrade the vault and retry with
 * exponential backoff instead of crashing the process.
 */
export class IndexerService {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly cursors = new Map<string, VaultCursor>();

  constructor(
    private readonly config: AppConfig,
    private readonly db: Db,
    private readonly vaultService: VaultService,
    private readonly sse: SseHub,
  ) {}

  start(): void {
    if (this.config.nearNetwork === 'local') return;
    this.timer = setInterval(() => void this.tick(), this.config.indexerPollMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const vaults = await this.db.vault.findMany({ where: { mode: 'near' }, take: 50 });
      await Promise.all(vaults.map((vault) => this.pollVault(vault.id)));
    } finally {
      this.running = false;
    }
  }

  private async pollVault(vaultId: string): Promise<void> {
    const state = this.cursors.get(vaultId) ?? {
      backoffMs: 0,
      nextAgentPoll: 0,
      nextBalancePoll: 0,
    };
    this.cursors.set(vaultId, state);
    if (state.backoffMs > 0 && Date.now() < state.nextAgentPoll) return;

    const row = await this.db.vault.findUnique({ where: { id: vaultId } });
    if (!row) return;
    const provider = await this.vaultService.nearProvider();
    try {
      const changes = (await provider.callFunction({
        contractId: vaultId,
        method: 'get_changes_since',
        args: { since_seq: Number(row.cursorSeq), limit: 100 },
      })) as { requests: PaymentRequest[]; latest_seq: number };
      await this.vaultService.upsertNearRequests(vaultId, changes.requests ?? []);
      await this.db.vault.update({
        where: { id: vaultId },
        data: {
          cursorSeq: BigInt(Math.max(Number(row.cursorSeq), Number(changes.latest_seq ?? 0))),
          health: 'ok',
          lastIndexedAt: new Date(),
        },
      });
      state.backoffMs = 0;

      if (Date.now() >= state.nextAgentPoll) {
        state.nextAgentPoll = Date.now() + 10_000;
        const agents = (await provider.callFunction({
          contractId: vaultId,
          method: 'get_agents',
          args: { from_index: 0, limit: 100 },
        })) as Array<{
          public_key: string;
          agent: {
            name: string;
            status: string;
            policy: Policy;
            created_at_ns: number;
            violations: number;
          };
        }>;
        await this.vaultService.upsertNearAgents(vaultId, agents ?? []);
        this.sse.publish(vaultId, 'vault.updated', { vaultId });
      }
    } catch (error) {
      state.backoffMs = Math.min(Math.max(state.backoffMs * 2, 2_000), 60_000);
      state.nextAgentPoll = Date.now() + state.backoffMs;
      await this.db.vault
        .update({ where: { id: vaultId }, data: { health: 'degraded' } })
        .catch(() => undefined);
      this.sse.publish(vaultId, 'indexer.degraded', {
        vaultId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
