import { AgentVaultClient, OwnerClient, generateAgentKey } from '@agentvault/sdk';
import type { Budget, PaymentArgs, PaymentRequest, Policy } from '@agentvault/shared';
import type {
  HarnessAgent,
  HarnessBackend,
  HarnessPaymentResult,
} from './types.js';

export interface NearBackendOptions {
  network: 'testnet' | 'mainnet';
  rpcUrl?: string;
  vaultId: string;
  ownerAccountId: string;
  ownerPrivateKey: string;
}

/**
 * Real-protocol backend. The owner key is only used by the harness process
 * (never by the API) and is supplied from the environment. Scenarios that need
 * deterministic clock travel are skipped in this mode.
 */
export class NearHarnessBackend implements HarnessBackend {
  readonly mode = 'near' as const;
  readonly vaultId: string;
  readonly ownerId: string;
  private readonly owner: OwnerClient;
  private readonly network: 'testnet' | 'mainnet';
  private readonly rpcUrl?: string;

  constructor(opts: NearBackendOptions) {
    this.network = opts.network;
    this.rpcUrl = opts.rpcUrl;
    this.vaultId = opts.vaultId;
    this.ownerId = opts.ownerAccountId;
    this.owner = new OwnerClient({
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      accountId: opts.ownerAccountId,
      privateKey: opts.ownerPrivateKey,
    });
  }

  async addAgent(opts: {
    name: string;
    policy: Policy;
    allowanceYocto?: string;
  }): Promise<HarnessAgent> {
    const key = generateAgentKey();
    await this.owner.addAgent(this.vaultId, {
      publicKey: key.publicKey,
      name: opts.name,
      policy: opts.policy,
      allowanceYocto: opts.allowanceYocto,
    });
    const client = new AgentVaultClient({
      network: this.network,
      rpcUrl: this.rpcUrl,
      vaultAccountId: this.vaultId,
      agentPrivateKey: key.privateKey,
    });
    // The access key is installed by a promise in the same transaction. Give
    // the protocol a moment to finalise it before the first agent call.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        await client.getBudget();
        break;
      } catch {
        await sleep(750);
      }
    }
    return {
      publicKey: key.publicKey,
      requestPayment: async (args: PaymentArgs) => normalize(await client.requestPayment(args)),
      getBudget: async () => {
        try {
          return await client.getBudget();
        } catch {
          return null;
        }
      },
      getRequest: async (id: number) => {
        try {
          return await client.getRequest(id);
        } catch {
          return null;
        }
      },
      tryCall: (method, args = {}, contractId) => client.tryCall(method, args, contractId),
    };
  }

  async freezeAgent(publicKey: string): Promise<void> {
    await this.owner.freezeAgent(this.vaultId, publicKey);
  }

  async unfreezeAgent(publicKey: string): Promise<void> {
    await this.owner.unfreezeAgent(this.vaultId, publicKey);
  }

  async revokeAgent(publicKey: string): Promise<void> {
    await this.owner.revokeAgent(this.vaultId, publicKey);
  }

  async pause(): Promise<void> {
    await this.owner.pause(this.vaultId);
  }

  async unpause(): Promise<void> {
    await this.owner.unpause(this.vaultId);
  }

  async approveRequest(requestId: number): Promise<void> {
    await this.owner.approveRequest(this.vaultId, requestId);
  }

  async rejectRequest(requestId: number): Promise<void> {
    await this.owner.rejectRequest(this.vaultId, requestId);
  }

  async getRequests(): Promise<PaymentRequest[]> {
    return this.owner.getRequests(this.vaultId, 0, 200, false);
  }

  async getAgentPolicy(publicKey: string): Promise<Policy | null> {
    const agent = await this.owner.view<{ policy: Policy } | null>(this.vaultId, 'get_agent', {
      public_key: publicKey,
    });
    return agent?.policy ?? null;
  }

  async getBudget(publicKey: string): Promise<Budget | null> {
    return this.owner.view<Budget | null>(this.vaultId, 'get_budget', { public_key: publicKey });
  }

  async getBalance(asset: string): Promise<string> {
    if (asset === 'NEAR') {
      const info = await this.owner.getStorageInfo(this.vaultId);
      return info.balance;
    }
    if (!asset.startsWith('ft:')) return '0';
    return this.owner.getFtBalance(asset.slice(3), this.vaultId);
  }

  async fund(asset: string, amount: string): Promise<void> {
    if (asset === 'NEAR') {
      await this.owner.transferNear(this.vaultId, amount);
      return;
    }
    if (!asset.startsWith('ft:')) throw new Error(`unsupported asset ${asset}`);
    await this.owner.transferFt(asset.slice(3), this.vaultId, amount);
  }

  async close(): Promise<void> {
    // No persistent resources.
  }
}

function normalize(result: Awaited<ReturnType<AgentVaultClient['requestPayment']>>): HarnessPaymentResult {
  return result as HarnessPaymentResult;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
