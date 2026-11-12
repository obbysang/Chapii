import { AgentVaultClient, publicKeyFor } from '@agentvault/sdk';
import type {
  Agent,
  Budget,
  PaymentArgs,
  PaymentRequest,
  Policy,
  ReasonCode,
  RequestStatus,
} from '@agentvault/shared';

export interface NormalizedPayment {
  decision: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'DUPLICATE' | 'TX_ERROR';
  request_id?: number;
  status?: RequestStatus;
  reason?: ReasonCode;
  message?: string;
  hint?: string;
  tx_hash?: string;
  error?: string;
}

export interface ToolRequest {
  request_id: number;
  agent_public_key: string;
  client_ref: string;
  asset: string;
  amount: string;
  chain: string;
  address: string;
  dest_asset: string | null;
  memo: string | null;
  status: RequestStatus;
  reason: ReasonCode | null;
  created_at: string;
  decided_at: string | null;
  deposit_address: string | null;
  settlement_ref: string | null;
}

export interface VaultBackend {
  readonly kind: 'local-http' | 'near';
  readonly vaultId: string;
  readonly publicKey: string;
  getBudget(): Promise<Budget>;
  getPolicy(): Promise<Policy>;
  requestPayment(args: PaymentArgs): Promise<NormalizedPayment>;
  getRequest(requestId: number): Promise<ToolRequest | null>;
  listRecentRequests(limit: number): Promise<ToolRequest[]>;
}

function isoFromNs(ns: number | null | undefined): string | null {
  if (!ns || ns <= 0) return null;
  return new Date(Math.floor(ns / 1_000_000)).toISOString();
}

function fromChainRequest(request: PaymentRequest): ToolRequest {
  return {
    request_id: request.id,
    agent_public_key: request.agent_pk,
    client_ref: request.client_ref,
    asset: request.asset,
    amount: request.amount,
    chain: request.chain,
    address: request.address,
    dest_asset: request.dest_asset,
    memo: request.memo,
    status: request.status,
    reason: request.reason,
    created_at: isoFromNs(request.created_ns) ?? new Date(0).toISOString(),
    decided_at: isoFromNs(request.decided_ns),
    deposit_address: request.deposit_address,
    settlement_ref: request.settlement_ref,
  };
}

// ---------------------------------------------------------------------------
// Real NEAR contract (primary path)
// ---------------------------------------------------------------------------

export class NearBackend implements VaultBackend {
  readonly kind = 'near' as const;
  readonly vaultId: string;
  readonly publicKey: string;
  private readonly client: AgentVaultClient;

  constructor(options: {
    vaultId: string;
    agentPrivateKey: string;
    network: 'testnet' | 'mainnet';
    rpcUrl?: string;
  }) {
    this.vaultId = options.vaultId;
    this.publicKey = publicKeyFor(options.agentPrivateKey);
    this.client = new AgentVaultClient({
      vaultAccountId: options.vaultId,
      agentPrivateKey: options.agentPrivateKey,
      network: options.network,
      rpcUrl: options.rpcUrl,
    });
  }

  async getBudget(): Promise<Budget> {
    return this.client.getBudget();
  }

  async getPolicy(): Promise<Policy> {
    const agent = await this.client.view<Agent | null>('get_agent', {
      public_key: this.publicKey,
    });
    if (!agent) {
      throw new Error(
        'this agent public key is not registered on the vault; the owner must add it first',
      );
    }
    return agent.policy;
  }

  async requestPayment(args: PaymentArgs): Promise<NormalizedPayment> {
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

  async getRequest(requestId: number): Promise<ToolRequest | null> {
    const request = await this.client.getRequest(requestId);
    return request ? fromChainRequest(request) : null;
  }

  async listRecentRequests(limit: number): Promise<ToolRequest[]> {
    const requests = await this.client.listRecentRequests(limit);
    return requests.map(fromChainRequest);
  }
}

// ---------------------------------------------------------------------------
// Local simulator over the AgentVault HTTP API
// ---------------------------------------------------------------------------

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

function fromLocalRequest(request: LocalRequestDto): ToolRequest {
  return {
    request_id: request.onchainId,
    agent_public_key: request.agentPublicKey,
    client_ref: request.clientRef,
    asset: request.asset,
    amount: request.amount,
    chain: request.chain,
    address: request.address,
    dest_asset: request.destAsset,
    memo: request.memo,
    status: request.status,
    reason: request.reason,
    created_at: request.createdAt,
    decided_at: request.decidedAt,
    deposit_address: request.depositAddress,
    settlement_ref: request.settlementRef,
  };
}

export class LocalHttpBackend implements VaultBackend {
  readonly kind = 'local-http' as const;
  readonly vaultId: string;
  readonly publicKey: string;
  private readonly baseUrl: string;

  constructor(options: { vaultId: string; agentPrivateKey: string; apiUrl: string }) {
    this.vaultId = options.vaultId;
    this.publicKey = publicKeyFor(options.agentPrivateKey);
    this.baseUrl = options.apiUrl.replace(/\/$/, '');
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
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
        const code = body.error?.code;
        const detail = body.error?.message ?? body.message;
        if (code || detail) message = `${code ?? 'HTTP_ERROR'}: ${detail ?? message}`;
      } catch {
        // Keep the status line when the body is not JSON.
      }
      throw new Error(message);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private agentPath(): string {
    return `/vaults/${encodeURIComponent(this.vaultId)}/agents/${encodeURIComponent(this.publicKey)}`;
  }

  async getBudget(): Promise<Budget> {
    return this.fetchJson<Budget>(`${this.agentPath()}/budget`);
  }

  async getPolicy(): Promise<Policy> {
    const agent = await this.fetchJson<{ policy: Policy }>(this.agentPath());
    return agent.policy;
  }

  async requestPayment(args: PaymentArgs): Promise<NormalizedPayment> {
    try {
      const result = await this.fetchJson<{
        decision: NormalizedPayment['decision'];
        requestId?: number;
        status?: RequestStatus;
        reason?: ReasonCode;
        message?: string;
        hint?: string;
        error?: string;
      }>(
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

  async getRequest(requestId: number): Promise<ToolRequest | null> {
    try {
      const request = await this.fetchJson<LocalRequestDto>(
        `/vaults/${encodeURIComponent(this.vaultId)}/requests/${requestId}`,
      );
      return fromLocalRequest(request);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('NOT_FOUND')) return null;
      throw error;
    }
  }

  async listRecentRequests(limit: number): Promise<ToolRequest[]> {
    const params = new URLSearchParams({
      agent: this.publicKey,
      limit: String(limit),
    });
    const page = await this.fetchJson<{ items: LocalRequestDto[] }>(
      `/vaults/${encodeURIComponent(this.vaultId)}/requests?${params.toString()}`,
    );
    return page.items.map(fromLocalRequest);
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface McpConfig {
  mode: 'local-http' | 'near';
  vaultId: string;
  agentPrivateKey: string;
  network: 'testnet' | 'mainnet';
  rpcUrl?: string;
  apiUrl: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(): McpConfig {
  const vaultId = required('VAULT_ACCOUNT_ID');
  const agentPrivateKey = required('AGENT_PRIVATE_KEY');
  const network = (process.env.NEAR_NETWORK?.trim() || 'testnet') as 'testnet' | 'mainnet';
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error('NEAR_NETWORK must be "testnet" or "mainnet"');
  }
  const explicitMode = process.env.AGENTVAULT_MODE?.trim();
  const apiUrl = (process.env.AGENTVAULT_API_URL?.trim() || 'http://localhost:8787').replace(
    /\/$/,
    '',
  );
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
    rpcUrl: process.env.NEAR_RPC_URL?.trim() || undefined,
    apiUrl,
  };
}

export function createBackend(config: McpConfig): VaultBackend {
  if (config.mode === 'local-http') {
    return new LocalHttpBackend({
      vaultId: config.vaultId,
      agentPrivateKey: config.agentPrivateKey,
      apiUrl: config.apiUrl,
    });
  }
  return new NearBackend({
    vaultId: config.vaultId,
    agentPrivateKey: config.agentPrivateKey,
    network: config.network,
    rpcUrl: config.rpcUrl,
  });
}
