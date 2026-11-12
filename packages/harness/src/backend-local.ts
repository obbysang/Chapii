import { EngineError, LocalVault } from '@agentvault/localchain';
import type { LocalEventListener } from '@agentvault/localchain';
import { REASON_MESSAGES, isReasonCode } from '@agentvault/shared';
import type {
  Budget,
  PaymentArgs,
  PaymentRequest,
  Policy,
  RequestStatus,
} from '@agentvault/shared';
import { generateAgentKey } from '@agentvault/sdk';
import type {
  HarnessAgent,
  HarnessBackend,
  HarnessPaymentResult,
} from './types.js';

export interface LocalBackendOptions {
  vaultId?: string;
  ownerId?: string;
  balances?: Record<string, string>;
  listener?: LocalEventListener;
}

export const HARNESS_USDC = 'ft:usdc.testnet';
export const HARNESS_USDT = 'ft:usdt.testnet';
export const HARNESS_NEAR = 'NEAR';

function defaultBalances(): Record<string, string> {
  return {
    NEAR: '1000000000000000000000000000', // 1,000 NEAR
    [HARNESS_USDC]: '1000000000000', // 1,000,000 USDC (6 decimals)
    [HARNESS_USDT]: '1000000000000',
  };
}

/**
 * Deterministic local implementation of the harness backend. It executes the
 * same policy ordering as contracts/vault/src/policy.rs. Protocol-level key
 * restrictions are emulated: only request_payment is permitted with an agent
 * key. Use --network testnet to exercise the real protocol guarantees.
 */
export class LocalHarnessBackend implements HarnessBackend {
  readonly mode = 'local' as const;
  readonly vault: LocalVault;
  readonly vaultId: string;
  readonly ownerId: string;
  private offsetMs = 0;

  constructor(opts: LocalBackendOptions = {}) {
    this.vaultId = opts.vaultId ?? 'harness-vault.testnet';
    this.ownerId = opts.ownerId ?? 'harness-owner.testnet';
    this.vault = LocalVault.create({
      vaultId: this.vaultId,
      ownerId: this.ownerId,
      balances: opts.balances ?? defaultBalances(),
      clock: () => Date.now() + this.offsetMs,
      listener: opts.listener,
    });
  }

  async addAgent(opts: {
    name: string;
    policy: Policy;
    allowanceYocto?: string;
  }): Promise<HarnessAgent> {
    const key = generateAgentKey();
    this.vault.addAgent(
      this.ownerId,
      key.publicKey,
      opts.name,
      opts.policy,
      opts.allowanceYocto,
    );
    return this.wrapAgent(key.publicKey);
  }

  async freezeAgent(publicKey: string): Promise<void> {
    this.vault.freezeAgent(this.ownerId, publicKey);
  }

  async unfreezeAgent(publicKey: string): Promise<void> {
    this.vault.unfreezeAgent(this.ownerId, publicKey);
  }

  async revokeAgent(publicKey: string): Promise<void> {
    this.vault.revokeAgent(this.ownerId, publicKey);
  }

  async pause(): Promise<void> {
    this.vault.pause(this.ownerId);
  }

  async unpause(): Promise<void> {
    this.vault.unpause(this.ownerId);
  }

  async approveRequest(requestId: number): Promise<void> {
    this.vault.approveRequest(this.ownerId, requestId);
  }

  async rejectRequest(requestId: number): Promise<void> {
    this.vault.rejectRequest(this.ownerId, requestId);
  }

  async getRequests(): Promise<PaymentRequest[]> {
    return this.vault.getRequests({ limit: 1000, reverse: false });
  }

  async getAgentPolicy(publicKey: string): Promise<Policy | null> {
    return this.vault.state.agents[publicKey]?.policy ?? null;
  }

  async getBudget(publicKey: string): Promise<Budget | null> {
    return this.vault.getBudget(publicKey) ?? null;
  }

  async getBalance(asset: string): Promise<string> {
    return this.vault.balanceOf(asset);
  }

  async fund(asset: string, amount: string): Promise<void> {
    this.vault.fund(asset, amount);
  }

  async advanceTime(ms: number): Promise<void> {
    this.offsetMs += ms;
  }

  async close(): Promise<void> {
    // The local backend owns no external resources.
  }

  private wrapAgent(publicKey: string): HarnessAgent {
    return {
      publicKey,
      requestPayment: async (args: PaymentArgs) => this.requestPayment(publicKey, args),
      getBudget: async () => this.vault.getBudget(publicKey) ?? null,
      getRequest: async (id: number) => this.vault.getRequest(id) ?? null,
      tryCall: async (method, _args = {}, contractId = this.vaultId) =>
        this.tryCall(publicKey, method, contractId),
    };
  }

  private async requestPayment(
    publicKey: string,
    args: PaymentArgs,
  ): Promise<HarnessPaymentResult> {
    try {
      const decision = this.vault.requestPayment(publicKey, args);
      const requestId = decision.data.request_id;
      const request = this.vault.getRequest(requestId) ?? null;
      if (decision.decision === 'REJECTED') {
        const reason = decision.data.reason;
        return {
          decision: 'REJECTED',
          requestId,
          reason,
          message: isReasonCode(reason) ? REASON_MESSAGES[reason].message : undefined,
          hint: isReasonCode(reason) ? REASON_MESSAGES[reason].hint : undefined,
          txHash: request?.txHash ?? undefined,
        };
      }
      if (decision.decision === 'DUPLICATE') {
        return {
          decision: 'DUPLICATE',
          requestId,
          status: decision.data.status,
          txHash: request?.txHash ?? undefined,
        };
      }
      return {
        decision: decision.decision,
        requestId,
        status: request?.status,
        txHash: request?.txHash ?? undefined,
      };
    } catch (error) {
      return {
        decision: 'TX_ERROR',
        error: error instanceof EngineError ? error.message : String(error),
      };
    }
  }

  private tryCall(
    publicKey: string,
    method: string,
    contractId: string,
  ): { ok: boolean; error?: string } {
    const agent = this.vault.state.agents[publicKey];
    if (!agent || agent.status === 'REVOKED') {
      return { ok: false, error: 'access key is not present on the vault account' };
    }
    if (contractId !== this.vaultId) {
      return {
        ok: false,
        error: `access key is restricted to receiver ${this.vaultId}`,
      };
    }
    if (method !== 'request_payment') {
      return {
        ok: false,
        error: 'access key is restricted to method request_payment',
      };
    }
    return { ok: true };
  }
}

export function requestStatusOf(result: HarnessPaymentResult): RequestStatus | null {
  return result.status ?? null;
}
