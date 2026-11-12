import { OwnerClient } from '@agentvault/sdk';
import type { PaymentRequest } from '@agentvault/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db.js';
import { AppError } from '../lib/errors.js';
import type { SseHub } from '../lib/sse.js';
import type { IntentsService } from './intents.js';
import type { VaultService } from './vault-service.js';

/**
 * Cross-chain payout executor.
 *
 * Local mode simulates the 1-Click quote + settlement so the demo shows the
 * complete state machine without touching funds. The simulated deposit address
 * is clearly marked (`sim-local-...`) and can never receive real value.
 *
 * NEAR mode implements the real state machine and only starts when both the
 * executor key and ONECLICK_API_URL are configured.
 */
export class ExecutorService {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly db: Db,
    private readonly vaultService: VaultService,
    private readonly intents: IntentsService,
    private readonly sse: SseHub,
  ) {}

  start(): void {
    if (this.config.nearNetwork === 'local') {
      this.timer = setInterval(() => void this.localTick(), this.config.executorPollMs);
      void this.localTick();
      return;
    }
    if (this.config.executorAccountId && this.config.executorPrivateKey && this.intents.enabled) {
      this.timer = setInterval(() => void this.nearTick(), this.config.executorPollMs);
      void this.nearTick();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async localTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const vaults = await this.db.vault.findMany({ where: { mode: 'local' }, take: 50 });
      for (const row of vaults) {
        const pending = await this.db.paymentRequest.findMany({
          where: { vaultId: row.id, status: 'AWAITING_EXECUTION', job: null },
          take: 5,
        });
        for (const request of pending) {
          if (this.inFlight.has(request.id)) continue;
          this.inFlight.add(request.id);
          void this.executeLocal(row.id, Number(request.onchainId)).finally(() =>
            this.inFlight.delete(request.id),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async executeLocal(vaultId: string, onchainId: number): Promise<void> {
    try {
      const vault = await this.vaultService.loadLocal(vaultId);
      const requestRow = await this.db.paymentRequest.findUnique({
        where: { vaultId_onchainId: { vaultId, onchainId: BigInt(onchainId) } },
      });
      if (!requestRow || requestRow.status !== 'AWAITING_EXECUTION') return;
      const depositAddress = `sim-local-${vaultId.replace(/[^a-z0-9]/g, '').slice(0, 12)}-${onchainId}`;
      const job = await this.db.crosschainJob.create({
        data: {
          requestId: requestRow.id,
          state: 'QUOTING',
          quoteJson: {
            simulated: true,
            reason: 'local demo mode; no funds move off-chain',
            depositAddress,
          },
          depositAddress,
        },
      });
      this.sse.publish(vaultId, 'crosschain.updated', { requestId: onchainId, state: 'QUOTING' });
      const executed = vault.executeCrosschain(onchainId, depositAddress);
      await this.vaultService.persistAndSync(vault);
      await this.db.crosschainJob.update({
        where: { id: job.id },
        data: {
          state: 'FUNDED',
          quoteJson: {
            simulated: true,
            depositAddress,
            request_id: onchainId,
          },
        },
      });
      this.sse.publish(vaultId, 'crosschain.updated', { requestId: onchainId, state: 'FUNDED' });

      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (executed.status === 'FAILED') {
        await this.db.crosschainJob.update({
          where: { id: job.id },
          data: { state: 'FAILED', lastError: 'simulated transfer failed' },
        });
        return;
      }
      const settlementRef = `sim-delivered-${onchainId}-${Date.now().toString(36)}`;
      vault.settleCrosschain(onchainId, 'DELIVERED', settlementRef);
      await this.vaultService.persistAndSync(vault);
      await this.db.crosschainJob.update({
        where: { id: job.id },
        data: {
          state: 'DELIVERED',
          verification: 'OK',
          statusJson: {
            simulated: true,
            outcome: 'DELIVERED',
            settlementRef,
          },
        },
      });
      this.sse.publish(vaultId, 'crosschain.updated', {
        requestId: onchainId,
        state: 'DELIVERED',
        settlementRef,
      });
    } catch (error) {
      this.sse.publish(vaultId, 'crosschain.updated', {
        requestId: onchainId,
        state: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async nearTick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (!this.config.executorAccountId || !this.config.executorPrivateKey) return;
      const executor = new OwnerClient({
        network: this.config.nearNetwork === 'mainnet' ? 'mainnet' : 'testnet',
        rpcUrl: this.config.nearRpcUrl,
        accountId: this.config.executorAccountId,
        privateKey: this.config.executorPrivateKey,
      });
      const rows = await this.db.paymentRequest.findMany({
        where: { status: 'AWAITING_EXECUTION', job: null, vault: { mode: 'near' } },
        include: { vault: true },
        take: 3,
      });
      for (const row of rows) {
        if (this.inFlight.has(row.id)) continue;
        this.inFlight.add(row.id);
        void this.executeNear(executor, row).finally(() => this.inFlight.delete(row.id));
      }
    } finally {
      this.running = false;
    }
  }

  private async executeNear(
    executor: OwnerClient,
    row: {
      id: string;
      vaultId: string;
      onchainId: bigint;
      asset: string;
      amount: { toFixed(digits: number): string };
      address: string;
      destAsset: string | null;
    },
  ): Promise<void> {
    const vaultId = row.vaultId;
    const onchainId = Number(row.onchainId);
    const job = await this.db.crosschainJob.create({
      data: { requestId: row.id, state: 'QUOTING' },
    });
    try {
      if (!this.intents.enabled) throw new AppError('INTENTS_NOT_CONFIGURED', 'Intents disabled', 503);
      const quote = await this.intents.quote({
        vaultId,
        originAsset: row.asset,
        destinationAsset: row.destAsset ?? 'USDC',
        amount: row.amount.toFixed(0),
        recipient: row.address,
        refundTo: vaultId,
      });
      const mismatch =
        quote.originAsset !== row.asset || (row.destAsset != null && quote.destinationAsset !== row.destAsset);
      if (mismatch) {
        await this.db.crosschainJob.update({
          where: { id: job.id },
          data: { state: 'FAILED', lastError: 'quote asset mismatch', verification: 'MISMATCH' },
        });
        this.sse.publish(vaultId, 'crosschain.updated', {
          requestId: onchainId,
          state: 'FAILED',
          message: 'quote asset mismatch',
        });
        return;
      }
      await this.db.crosschainJob.update({
        where: { id: job.id },
        data: { state: 'QUOTED', quoteJson: quote.quote as never, depositAddress: quote.depositAddress },
      });
      const tx = await executor.executeCrosschain(vaultId, onchainId, quote.depositAddress);
      await this.db.crosschainJob.update({
        where: { id: job.id },
        data: { state: 'FUNDED', fundTxHash: tx.txHash ?? null },
      });
      this.sse.publish(vaultId, 'crosschain.updated', { requestId: onchainId, state: 'FUNDED' });

      const deadline = Date.now() + 10 * 60_000;
      let outcome: 'DELIVERED' | 'REFUNDED' | 'FAILED' = 'FAILED';
      let settlementRef = '';
      while (Date.now() < deadline) {
        const status = (await this.intents.status(quote.depositAddress)) as {
          status?: string;
          swapDetails?: { destinationChainTxHashes?: Array<{ hash: string }> };
          depositAddress?: string;
        };
        const value = (status.status ?? '').toUpperCase();
        if (['SUCCESS', 'COMPLETED', 'DELIVERED'].includes(value)) {
          outcome = 'DELIVERED';
          settlementRef =
            status.swapDetails?.destinationChainTxHashes?.[0]?.hash ?? quote.depositAddress;
          break;
        }
        if (['REFUNDED'].includes(value)) {
          outcome = 'REFUNDED';
          settlementRef = quote.depositAddress;
          break;
        }
        if (['FAILED', 'INCOMPLETE_DEPOSIT', 'EXPIRED'].includes(value)) {
          outcome = 'FAILED';
          settlementRef = quote.depositAddress;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
      await executor.reportCrosschainResult(vaultId, onchainId, outcome, settlementRef);
      await this.db.crosschainJob.update({
        where: { id: job.id },
        data: {
          state: outcome === 'DELIVERED' ? 'DELIVERED' : outcome === 'REFUNDED' ? 'REFUNDED' : 'FAILED',
          statusJson: { outcome, settlementRef } as never,
          verification: outcome === 'DELIVERED' ? 'OK' : 'UNVERIFIED',
        },
      });
      this.sse.publish(vaultId, 'crosschain.updated', { requestId: onchainId, state: outcome });
    } catch (error) {
      await this.db.crosschainJob.update({
        where: { id: job.id },
        data: {
          state: 'FAILED',
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
