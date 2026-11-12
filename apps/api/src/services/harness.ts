import { LocalHarnessBackend, NearHarnessBackend, runHarness } from '@agentvault/harness';
import type { HarnessReport, ScenarioResult } from '@agentvault/harness';
import type { AppConfig } from '../config.js';
import type { Db } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import type { SseHub } from '../lib/sse.js';
import type { VaultService } from './vault-service.js';

export class HarnessService {
  private readonly active = new Set<string>();
  private readonly requestsByIp = new Map<string, number[]>();

  constructor(
    private readonly config: AppConfig,
    private readonly db: Db,
    private readonly vaultService: VaultService,
    private readonly sse: SseHub,
  ) {}

  async start(vaultId: string, requesterIp: string): Promise<{ runId: string }> {
    if (!this.config.harnessEnabled) {
      throw new AppError(
        'HARNESS_DISABLED',
        'the attack suite is disabled on this deployment (HARNESS_ENABLED=false)',
        403,
      );
    }
    if (this.config.nearNetwork === 'mainnet') {
      throw new AppError('HARNESS_MAINNET', 'the attack suite never runs on mainnet', 403);
    }
    if (this.active.has(vaultId)) {
      throw new AppError('HARNESS_BUSY', 'a run is already in progress for this vault', 409);
    }
    const history = (this.requestsByIp.get(requesterIp) ?? []).filter(
      (at) => Date.now() - at < 60 * 60 * 1000,
    );
    if (history.length >= this.config.harnessPerHour) {
      throw new AppError('HARNESS_RATE_LIMITED', 'too many runs; try again later', 429);
    }
    history.push(Date.now());
    this.requestsByIp.set(requesterIp, history);

    const vault = await this.db.vault.findUnique({ where: { id: vaultId } });
    if (!vault) throw notFound(`vault ${vaultId} is not registered`);
    this.active.add(vaultId);

    const run = await this.db.harnessRun.create({
      data: {
        vaultId,
        status: 'QUEUED',
        total: 34,
        requesterIp,
      },
    });
    void this.execute(run.id, vaultId).finally(() => this.active.delete(vaultId));
    return { runId: run.id };
  }

  private async execute(runId: string, vaultId: string): Promise<void> {
    await this.db.harnessRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    this.sse.publish(vaultId, 'harness.started', { runId });
    let backend: LocalHarnessBackend | NearHarnessBackend | undefined;
    try {
      if (this.config.nearNetwork === 'local') {
        const vault = await this.vaultService.loadLocal(vaultId);
        backend = new LocalHarnessBackend({
          vaultId,
          ownerId: vault.state.ownerId,
          balances: vault.state.balances,
        });
      } else {
        if (!this.config.harnessOwnerAccountId || !this.config.harnessOwnerPrivateKey) {
          throw new Error(
            'testnet harness needs HARNESS_OWNER_ACCOUNT_ID and HARNESS_OWNER_PRIVATE_KEY',
          );
        }
        backend = new NearHarnessBackend({
          network: this.config.nearNetwork,
          rpcUrl: this.config.nearRpcUrl,
          vaultId,
          ownerAccountId: this.config.harnessOwnerAccountId,
          ownerPrivateKey: this.config.harnessOwnerPrivateKey,
        });
      }

      const report: HarnessReport = await runHarness({
        backend,
        onProgress: (result: ScenarioResult, index: number, total: number) => {
          this.sse.publish(vaultId, 'harness.progress', {
            runId,
            index: index + 1,
            total,
            result,
          });
        },
      });
      await this.persistReport(runId, report);
      this.sse.publish(vaultId, 'harness.completed', {
        runId,
        headline: report.headline,
        report,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db.harnessRun.update({
        where: { id: runId },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          summaryJson: { error: message },
        },
      });
      this.sse.publish(vaultId, 'harness.completed', { runId, error: message });
    } finally {
      await backend?.close?.();
    }
  }

  private async persistReport(runId: string, report: HarnessReport): Promise<void> {
    await this.db.harnessResult.deleteMany({ where: { runId } });
    for (const result of report.results) {
      await this.db.harnessResult.create({
        data: {
          runId,
          scenarioId: result.scenarioId,
          category: result.category,
          title: result.title,
          expected: result.expected,
          actual: result.actual,
          passed: result.passed,
          txHash: result.txHash,
          invariantsOk: result.invariantsOk,
          notes: result.notes,
          durationMs: result.durationMs,
        },
      });
    }
    await this.db.harnessRun.update({
      where: { id: runId },
      data: {
        status: 'DONE',
        total: report.total,
        passed: report.passed,
        startedAt: new Date(report.startedAt),
        finishedAt: new Date(report.finishedAt),
        summaryJson: report as never,
      },
    });
  }

  async latest(vaultId: string): Promise<HarnessReport | null> {
    const row = await this.db.harnessRun.findFirst({
      where: { vaultId, status: 'DONE' },
      orderBy: { finishedAt: 'desc' },
    });
    return (row?.summaryJson as unknown as HarnessReport) ?? null;
  }
}
