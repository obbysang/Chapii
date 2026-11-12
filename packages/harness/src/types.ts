import type {
  Budget,
  Decision,
  PaymentArgs,
  PaymentRequest,
  Policy,
  ReasonCode,
  RequestStatus,
} from '@agentvault/shared';

export type HarnessMode = 'local' | 'near';

export interface HarnessAgent {
  publicKey: string;
  requestPayment(args: PaymentArgs): Promise<HarnessPaymentResult>;
  getBudget(): Promise<Budget | null>;
  getRequest(id: number): Promise<PaymentRequest | null>;
  tryCall(
    method: string,
    args?: Record<string, unknown>,
    contractId?: string,
  ): Promise<{ ok: boolean; error?: string }>;
}

export interface HarnessPaymentResult {
  decision: Decision['decision'] | 'TX_ERROR';
  requestId?: number;
  status?: RequestStatus;
  reason?: ReasonCode;
  message?: string;
  hint?: string;
  txHash?: string;
  error?: string;
}

export interface HarnessBackend {
  readonly mode: HarnessMode;
  readonly vaultId: string;
  readonly ownerId: string;
  addAgent(opts: {
    name: string;
    policy: Policy;
    allowanceYocto?: string;
  }): Promise<HarnessAgent>;
  freezeAgent(publicKey: string): Promise<void>;
  unfreezeAgent(publicKey: string): Promise<void>;
  revokeAgent(publicKey: string): Promise<void>;
  pause(): Promise<void>;
  unpause(): Promise<void>;
  approveRequest(requestId: number): Promise<void>;
  rejectRequest(requestId: number): Promise<void>;
  getRequests(): Promise<PaymentRequest[]>;
  getAgentPolicy(publicKey: string): Promise<Policy | null>;
  getBudget(publicKey: string): Promise<Budget | null>;
  getBalance(asset: string): Promise<string>;
  fund(asset: string, amount: string): Promise<void>;
  /** Only the local emulator supports deterministic clock travel. */
  advanceTime?(ms: number): Promise<void>;
  close?(): Promise<void>;
}

export interface ScenarioContext {
  backend: HarnessBackend;
  createAgent(opts: {
    name: string;
    policy: Policy;
    allowanceYocto?: string;
  }): Promise<HarnessAgent>;
  expect: ScenarioAssertions;
}

export interface ScenarioAssertions {
  approved(result: HarnessPaymentResult): void;
  pending(result: HarnessPaymentResult): void;
  rejected(result: HarnessPaymentResult, reason: ReasonCode): void;
  duplicate(result: HarnessPaymentResult): void;
  txError(result: HarnessPaymentResult): void;
  protocolRejected(result: { ok: boolean; error?: string }): void;
  equal<T>(actual: T, expected: T, label: string): void;
  ok(condition: boolean, message: string): void;
  status(request: PaymentRequest | null, expected: RequestStatus): void;
}

export interface Scenario {
  id: string;
  category: string;
  title: string;
  attack: string;
  expected: string;
  /** Control scenarios are not attacks but must pass for the guarantees to hold. */
  control?: boolean;
  run(ctx: ScenarioContext): Promise<void>;
}

export interface ScenarioResult {
  scenarioId: string;
  category: string;
  title: string;
  attack: string;
  expected: string;
  actual: string;
  passed: boolean;
  control: boolean;
  skipped: boolean;
  invariantsOk: boolean;
  notes: string | null;
  txHash: string | null;
  durationMs: number;
}

export interface HarnessReport {
  version: 1;
  mode: HarnessMode;
  network: 'local' | 'testnet' | 'mainnet';
  vaultId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  skipped: number;
  attacks: number;
  attacksContained: number;
  controls: number;
  controlsPassed: number;
  invariantsOk: boolean;
  llm: boolean;
  headline: string;
  results: ScenarioResult[];
}

export interface RunOptions {
  backend: HarnessBackend;
  llm?: boolean;
  onProgress?: (result: ScenarioResult, index: number, total: number) => void;
  /** Limit to specific scenario ids (useful for debugging). */
  only?: string[];
}
