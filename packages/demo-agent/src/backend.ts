import { AgentVaultClient, publicKeyFor } from '@agentvault/sdk';
import type { Budget, PaymentArgs, PaymentRequest, Policy, ReasonCode, RequestStatus } from '@agentvault/shared';

export interface AgentPaymentResult {
  decision: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'DUPLICATE' | 'TX_ERROR';
  request_id?: number;
  status?: RequestStatus;
  reason?: ReasonCode;
  message?: string;
  hint?: string;
  tx_hash?: string;
  error?: string;
}

export interface AgentRuntime {
  readonly kind: 'local-http' | 'near';
  readonly vaultId: string;
  readonly publicKey: string;
  getBudget(): Promise<Budget>;
  getPolicy(): Promise<Policy>;
  requestPayment(args: PaymentArgs): Promise<AgentPaymentResult>;
  getRequest(id: number): Promise<PaymentRequest | null>;
}

export interface RuntimeConfig {
  mode: 'local-http' | 'near';
  vaultId: string;
  agentPrivateKey: string;
  network: 'testnet' | 'mainnet';
  apiUrl: string;
  rpcUrl?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadRuntimeConfig(): RuntimeConfig {
  const vaultId = required('VAULT_ACCOUNT_ID');
  const agentPrivateKey = required('AGENT_PRIVATE_KEY');
  const network = (process.env.NEAR_NETWORK?.trim() || 'testnet') as 'testnet' | 'mainnet';
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error('NEAR_NETWORK must be "testnet" or "mainnet"');
  }
  const explicitMode = process.env.AGENTVAULT_MODE?.trim();
  const mode =
    explicitMode === 'local-http' || explicitMode === 'near'
      ? explicitMode
      : process.env.AGENTVAULT_API_URL?.trim()
        ? 'local-http'
        : 'near';
  return {
    mode,
    vaultId,
    agentPrivateKey,
    network,
    apiUrl: (process.env.AGENTVAULT_API_URL?.trim() || 'http://localhost:8787').replace(/\/$/, ''),
    rpcUrl: process.env.NEAR_RPC_URL?.trim() || undefined,
  };
}

export class NearAgentRuntime implements AgentRuntime {
  readonly kind = 'near' as const;
  readonly publicKey: string;
  readonly vaultId: string;
  private readonly client: AgentVaultClient;

  constructor(config: RuntimeConfig) {
    this.vaultId = config.vaultId;
    this.publicKey = publicKeyFor(config.agentPrivateKey);
    this.client = new AgentVaultClient({
      vaultAccountId: config.vaultId,
      agentPrivateKey: config.agentPrivateKey,
      network: config.network,
      rpcUrl: config.rpcUrl,
    });
  }

  async getBudget(): Promise<Budget> {
    return this.client.getBudget();
  }

  async getPolicy(): Promise<Policy> {
    return this.client.getPolicy();
  }

  async requestPayment(args: PaymentArgs): Promise<AgentPaymentResult> {
    const result = await this.client.requestPayment(args);
    return {
      decision: result.decision,
      request_id: result.requestId,
      status: result.status,
      reason: result.reason,
      message: result.message,
      hint: result.hint,
      tx_hash: result.txHash,
      error: result.error,
    };
  }

  async getRequest(id: number): Promise<PaymentRequest | null> {
    return this.client.getRequest(id);
  }
}

interface LocalRequestDto {
  onchainId: number;
  agentPublicKey: string;
  clientRef: string;
  asset: string;
  amount: string;
  chain: string;
  address: string;
  destAsset: string | null;
  memo: string | null;
  status: RequestStatus;
  reason: ReasonCode | null;
  createdAt: string;
  decidedAt: string | null;
  depositAddress: string | null;
  settlementRef: string | null;
}

function toChainRequest(dto: LocalRequestDto): PaymentRequest {
  return {
    id: dto.onchainId,
    agent_pk: dto.agentPublicKey,
    client_ref: dto.clientRef,
    asset: dto.asset,
    amount: dto.amount,
    chain: dto.chain,
    address: dto.address,
    dest_asset: dto.destAsset,
    memo: dto.memo,
    status: dto.status,
    reason: dto.reason,
    created_ns: new Date(dto.createdAt).getTime() * 1_000_000,
    decided_ns: dto.decidedAt ? new Date(dto.decidedAt).getTime() * 1_000_000 : null,
    deposit_address: dto.depositAddress,
    settlement_ref: dto.settlementRef,
    last_change_seq: 0,
    usage_day_bucket: 0,
  };
}

export async function fetchJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
        message?: string;
      };
      const detail = body.error?.message ?? body.message;
      message = body.error?.code ? `${body.error.code}: ${detail ?? message}` : (detail ?? message);
    } catch {
      // Keep the status line when the body is not JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export class LocalAgentRuntime implements AgentRuntime {
  readonly kind = 'local-http' as const;
  readonly publicKey: string;
  readonly vaultId: string;
  private readonly apiUrl: string;

  constructor(config: RuntimeConfig) {
    this.vaultId = config.vaultId;
    this.publicKey = publicKeyFor(config.agentPrivateKey);
    this.apiUrl = config.apiUrl;
  }

  async getBudget(): Promise<Budget> {
    return fetchJson<Budget>(
      this.apiUrl,
      `/vaults/${encodeURIComponent(this.vaultId)}/agents/${encodeURIComponent(this.publicKey)}/budget`,
    );
  }

  async getPolicy(): Promise<Policy> {
    const agent = await fetchJson<{ policy: Policy }>(
      this.apiUrl,
      `/vaults/${encodeURIComponent(this.vaultId)}/agents/${encodeURIComponent(this.publicKey)}`,
    );
    return agent.policy;
  }

  async requestPayment(args: PaymentArgs): Promise<AgentPaymentResult> {
    try {
      const result = await fetchJson<{
        decision: AgentPaymentResult['decision'];
        requestId?: number;
        status?: RequestStatus;
        reason?: ReasonCode;
        message?: string;
        hint?: string;
        error?: string;
      }>(
        this.apiUrl,
        `/local/vaults/${encodeURIComponent(this.vaultId)}/agents/${encodeURIComponent(
          this.publicKey,
        )}/requests`,
        { method: 'POST', body: JSON.stringify(args) },
      );
      return {
        decision: result.decision,
        request_id: result.requestId,
        status: result.status,
        reason: result.reason,
        message: result.message,
        hint: result.hint,
        error: result.error,
      };
    } catch (error) {
      return {
        decision: 'TX_ERROR',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getRequest(id: number): Promise<PaymentRequest | null> {
    try {
      const dto = await fetchJson<LocalRequestDto>(
        this.apiUrl,
        `/vaults/${encodeURIComponent(this.vaultId)}/requests/${id}`,
      );
      return toChainRequest(dto);
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOT_FOUND')) return null;
      throw error;
    }
  }
}

export function createRuntime(config: RuntimeConfig): AgentRuntime {
  if (config.mode === 'local-http') return new LocalAgentRuntime(config);
  return new NearAgentRuntime(config);
}
