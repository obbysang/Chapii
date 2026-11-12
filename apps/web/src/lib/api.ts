import type {
  AgentViewResponse,
  Budget,
  HarnessRunDto,
  HealthResponse,
  IntentsQuote,
  Policy,
  RequestDto,
  VaultSummary,
} from '@agentvault/shared';

const configured = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();

/** The nginx container strips /api; Vite proxies it during development. */
export const API_BASE = (configured && configured.length > 0 ? configured : '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the AgentVault API. Is the container running on port 8787?',
    );
  }
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || 'Request failed';
    let details: unknown;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string; details?: unknown };
        message?: string;
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? body.message ?? message;
      details = body.error?.details;
    } catch {
      // Non-JSON error body: keep the HTTP status text.
    }
    throw new ApiError(response.status, code, message, details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface LocalPaymentResult {
  decision: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'DUPLICATE' | 'TX_ERROR';
  requestId?: number;
  status?: string;
  reason?: string;
  message?: string;
  hint?: string;
  error?: string;
}

export interface NewAgentResult {
  publicKey: string;
  privateKey: string;
  name: string;
}

export interface PaymentBody {
  client_ref: string;
  asset: string;
  amount: string;
  chain: string;
  address: string;
  dest_asset?: string | null;
  memo?: string | null;
}

export interface RunsResponse {
  items: HarnessRunDto[];
}

export interface RequestsResponse {
  items: RequestDto[];
  nextCursor: number | null;
}

export interface PagedVaults {
  items: VaultSummary[];
}

export const api = {
  health: () => http<HealthResponse>('/health'),

  listVaults: (owner?: string) =>
    http<PagedVaults>(`/vaults${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`),

  getVault: (vaultId: string) =>
    http<VaultSummary>(`/vaults/${encodeURIComponent(vaultId)}/summary`),

  createLocalVault: (body: {
    label?: string;
    ownerId?: string;
    fundingNear?: string;
    fundUsdc?: string;
  }) =>
    http<VaultSummary>('/local/vaults', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  registerVault: (body: { vaultId: string; label?: string | null }) =>
    http<VaultSummary>('/vaults', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  agents: (vaultId: string) =>
    http<{ items: AgentViewResponse[] }>(`/vaults/${encodeURIComponent(vaultId)}/agents`),

  agent: (vaultId: string, publicKey: string) =>
    http<AgentViewResponse>(
      `/vaults/${encodeURIComponent(vaultId)}/agents/${encodeURIComponent(publicKey)}`,
    ),

  budget: (vaultId: string, publicKey: string) =>
    http<Budget>(
      `/vaults/${encodeURIComponent(vaultId)}/agents/${encodeURIComponent(publicKey)}/budget`,
    ),

  requests: (
    vaultId: string,
    query: {
      cursor?: number;
      limit?: number;
      status?: string;
      agent?: string;
      reason?: string;
      q?: string;
    } = {},
  ) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return http<RequestsResponse>(
      `/vaults/${encodeURIComponent(vaultId)}/requests${qs ? `?${qs}` : ''}`,
    );
  },

  request: (vaultId: string, onchainId: string | number) =>
    http<RequestDto>(
      `/vaults/${encodeURIComponent(vaultId)}/requests/${encodeURIComponent(String(onchainId))}`,
    ),

  approvals: (vaultId: string) =>
    http<{ items: RequestDto[] }>(`/vaults/${encodeURIComponent(vaultId)}/approvals`),

  addLocalAgent: (
    vaultId: string,
    body: { name: string; policy: Policy; allowanceYocto?: string },
  ) =>
    http<NewAgentResult>(`/local/vaults/${encodeURIComponent(vaultId)}/agents`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  localPayment: (vaultId: string, publicKey: string, body: PaymentBody) =>
    http<LocalPaymentResult>(
      `/local/vaults/${encodeURIComponent(vaultId)}/agents/${encodeURIComponent(publicKey)}/requests`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  localAction: (
    vaultId: string,
    action:
      | { type: 'pause' }
      | { type: 'unpause' }
      | { type: 'freeze_agent' | 'unfreeze_agent' | 'revoke_agent'; publicKey: string }
      | { type: 'update_policy'; publicKey: string; policy: Policy }
      | { type: 'approve_request' | 'reject_request'; requestId: number }
      | { type: 'set_executor'; executorId: string | null }
      | { type: 'withdraw'; asset: string; amount: string; to: string },
  ) =>
    http<Record<string, unknown>>(`/local/vaults/${encodeURIComponent(vaultId)}/actions`, {
      method: 'POST',
      body: JSON.stringify(action),
    }),

  fundLocal: (vaultId: string, asset: string, amount: string) =>
    http<{ ok: boolean }>(`/local/vaults/${encodeURIComponent(vaultId)}/fund`, {
      method: 'POST',
      body: JSON.stringify({ asset, amount }),
    }),

  setExecutor: (vaultId: string, executorId: string | null) =>
    http<Record<string, unknown>>(`/local/vaults/${encodeURIComponent(vaultId)}/executor`, {
      method: 'POST',
      body: JSON.stringify({ executorId }),
    }),

  startHarness: (vaultId: string) =>
    http<{ runId: string }>('/harness/runs', {
      method: 'POST',
      body: JSON.stringify({ vaultId }),
    }),

  harnessRuns: (vaultId: string) =>
    http<RunsResponse>(`/vaults/${encodeURIComponent(vaultId)}/harness`),

  harnessRun: (runId: string) =>
    http<HarnessRunDto>(`/harness/runs/${encodeURIComponent(runId)}`),

  intentsConfig: () =>
    http<{ enabled: boolean; mainnetOnly: boolean; message: string }>('/intents/config'),

  intentsQuote: (body: {
    vaultId: string;
    originAsset: string;
    destinationAsset: string;
    amount: string;
    refundTo?: string;
  }) =>
    http<IntentsQuote>('/intents/fund-quote', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  intentsStatus: (depositAddress: string) =>
    http<Record<string, unknown>>(
      `/intents/status?depositAddress=${encodeURIComponent(depositAddress)}`,
    ),
};

export type StreamHandler = (event: { event: string; data: Record<string, unknown> }) => void;

const STREAM_EVENTS = [
  'connected',
  'request.created',
  'request.updated',
  'agent.updated',
  'vault.updated',
  'chain.event',
  'crosschain.updated',
  'harness.started',
  'harness.progress',
  'harness.completed',
];

export function subscribeToVault(
  vaultId: string,
  onEvent: StreamHandler,
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void,
): () => void {
  onStatus?.('connecting');
  const source = new EventSource(`${API_BASE}/vaults/${encodeURIComponent(vaultId)}/stream`);
  const handler = (event: Event) => {
    const message = event as MessageEvent<string>;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(message.data) as Record<string, unknown>;
    } catch {
      // Ignore malformed frames; the next event or poll will resync state.
    }
    onEvent({ event: message.type, data });
  };
  for (const name of STREAM_EVENTS) source.addEventListener(name, handler);
  source.onopen = () => onStatus?.('open');
  source.onerror = () => onStatus?.('closed');
  return () => source.close();
}
