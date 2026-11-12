import { Account, JsonRpcProvider, KeyPair, KeyPairString, PublicKey, teraToGas } from 'near-api-js';
import type {
  Agent,
  Budget,
  Decision,
  PaymentArgs,
  PaymentRequest,
  Policy,
  ReasonCode,
  RequestStatus,
} from '@agentvault/shared';
import { NETWORKS, REASON_MESSAGES, isReasonCode } from '@agentvault/shared';

export const TESTNET_RPC = NETWORKS.testnet.rpcUrl;
export const MAINNET_RPC = NETWORKS.mainnet.rpcUrl;

export interface NetworkOptions {
  network: 'testnet' | 'mainnet';
  rpcUrl?: string;
}

export interface AgentVaultClientOptions extends NetworkOptions {
  vaultAccountId: string;
  agentPrivateKey: string;
}

export interface NormalizedPaymentResult {
  decision: 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED' | 'DUPLICATE' | 'TX_ERROR';
  requestId?: number;
  status?: RequestStatus;
  reason?: ReasonCode;
  message?: string;
  hint?: string;
  txHash?: string;
  error?: string;
}

function rpcUrl(opts: NetworkOptions): string {
  return opts.rpcUrl ?? NETWORKS[opts.network].rpcUrl;
}

export function publicKeyFor(privateKey: string): string {
  return KeyPair.fromString(privateKey as KeyPairString).getPublicKey().toString();
}

/** Extract the JSON return value from a final execution outcome. */
export function extractReturnValue(outcome: unknown): unknown {
  const o = outcome as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (o.status) candidates.push(o.status);
  const receipts = (o.receipts_outcome ?? o.receiptsOutcome) as
    | Array<{ outcome?: { status?: unknown } }>
    | undefined;
  if (Array.isArray(receipts)) {
    for (const receipt of receipts) {
      if (receipt?.outcome?.status) candidates.push(receipt.outcome.status);
    }
  }
  for (const status of candidates.reverse()) {
    if (status && typeof status === 'object' && 'SuccessValue' in (status as object)) {
      const value = (status as { SuccessValue: string }).SuccessValue;
      if (!value) return undefined;
      const text = Buffer.from(value, 'base64').toString('utf8');
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }
  return undefined;
}

function transactionHash(outcome: unknown): string | undefined {
  const o = outcome as Record<string, any>;
  return (
    o?.transaction?.hash ??
    o?.transaction_outcome?.id ??
    o?.transaction_outcome?.transaction_hash ??
    o?.transactionHash ??
    undefined
  );
}

export class AgentVaultClient {
  readonly vaultAccountId: string;
  readonly publicKey: string;
  private readonly provider: JsonRpcProvider;
  private readonly account: Account;

  constructor(opts: AgentVaultClientOptions) {
    this.vaultAccountId = opts.vaultAccountId;
    this.provider = new JsonRpcProvider({ url: rpcUrl(opts) });
    this.publicKey = publicKeyFor(opts.agentPrivateKey);
    // Agent transactions are signed as the vault account with the agent's
    // function-call access key. The protocol only permits request_payment.
    this.account = new Account(
      opts.vaultAccountId,
      this.provider,
      opts.agentPrivateKey as KeyPairString,
    );
  }

  async getBudget(): Promise<Budget> {
    return this.view<Budget>('get_budget', { public_key: this.publicKey });
  }

  async getPolicy(): Promise<Policy> {
    const agent = await this.view<Agent | null>('get_agent', { public_key: this.publicKey });
    if (!agent) throw new Error('agent key is not registered on this vault');
    return agent.policy;
  }

  async getRequest(id: number): Promise<PaymentRequest | null> {
    return this.view<PaymentRequest | null>('get_request', { request_id: id });
  }

  async listRecentRequests(limit = 10): Promise<PaymentRequest[]> {
    const all = await this.view<PaymentRequest[]>('get_requests', {
      from_id: 0,
      limit: 200,
      reverse: false,
    });
    return all
      .filter((r) => r.agent_pk === this.publicKey)
      .slice(-limit)
      .reverse();
  }

  async requestPayment(args: PaymentArgs): Promise<NormalizedPaymentResult> {
    try {
      // callFunctionRaw returns the full RPC response, including the return
      // value of the final receipt. callFunction would decode the value for us
      // but does not expose the transaction hash, which the harness and the
      // dashboard need for explorer links.
      const outcome = await this.account.callFunctionRaw({
        contractId: this.vaultAccountId,
        methodName: 'request_payment',
        args: {
          client_ref: args.client_ref,
          asset: args.asset,
          amount: args.amount,
          chain: args.chain,
          address: args.address,
          dest_asset: args.dest_asset ?? null,
          memo: args.memo ?? null,
        },
        gas: teraToGas('100'),
      });
      const decoded = extractReturnValue(outcome) as Decision | undefined;
      const hash = transactionHash(outcome);
      if (!decoded || typeof decoded !== 'object' || !('decision' in decoded)) {
        return {
          decision: 'TX_ERROR',
          txHash: hash,
          error: 'transaction succeeded but returned no Decision',
        };
      }
      if (decoded.decision === 'REJECTED') {
        return {
          decision: 'REJECTED',
          requestId: decoded.data.request_id,
          reason: decoded.data.reason,
          message: isReasonCode(decoded.data.reason)
            ? REASON_MESSAGES[decoded.data.reason].message
            : 'Rejected by vault policy',
          hint: isReasonCode(decoded.data.reason)
            ? REASON_MESSAGES[decoded.data.reason].hint
            : undefined,
          txHash: hash,
        };
      }
      if (decoded.decision === 'DUPLICATE') {
        return {
          decision: 'DUPLICATE',
          requestId: decoded.data.request_id,
          status: decoded.data.status,
          txHash: hash,
        };
      }
      return {
        decision: decoded.decision,
        requestId: decoded.data.request_id,
        txHash: hash,
      };
    } catch (error) {
      return {
        decision: 'TX_ERROR',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async waitForTerminal(
    id: number,
    opts: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<PaymentRequest> {
    const timeoutMs = opts.timeoutMs ?? 90_000;
    const pollMs = opts.pollMs ?? 2_000;
    const started = Date.now();
    let last: PaymentRequest | null = null;
    while (Date.now() - started < timeoutMs) {
      last = await this.getRequest(id);
      if (last && isTerminal(last.status)) return last;
      await sleep(pollMs);
    }
    if (!last) throw new Error(`request ${id} not found`);
    return last;
  }

  async view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({
      contractId: this.vaultAccountId,
      method,
      args,
    })) as T;
  }

  /**
   * Attempt an arbitrary call with the agent key. Used by the red-team harness
   * to prove the protocol rejects anything except request_payment.
   */
  async tryCall(
    methodName: string,
    args: Record<string, unknown> = {},
    contractId = this.vaultAccountId,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.account.callFunction({
        contractId,
        methodName,
        args,
        gas: teraToGas('30'),
        deposit: 0n,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

const TERMINAL_STATUSES = new Set<RequestStatus>([
  'REJECTED',
  'COMPLETED',
  'FAILED',
  'REJECTED_BY_OWNER',
  'EXPIRED',
]);

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface OwnerClientOptions extends NetworkOptions {
  accountId: string;
  privateKey: string;
}

export interface CreateVaultOptions {
  vaultId: string;
  ownerId?: string;
  wasm: Uint8Array;
  fundingYocto?: bigint;
  /** Dev mode keeps a full-access key on the vault. Locked mode has zero keys. */
  devMode?: boolean;
}

export class OwnerClient {
  readonly accountId: string;
  private readonly privateKey: string;
  private readonly provider: JsonRpcProvider;
  private readonly account: Account;

  constructor(opts: OwnerClientOptions) {
    this.accountId = opts.accountId;
    this.privateKey = opts.privateKey;
    this.provider = new JsonRpcProvider({ url: rpcUrl(opts) });
    this.account = new Account(opts.accountId, this.provider, opts.privateKey as KeyPairString);
  }

  async getBalance(): Promise<bigint> {
    return this.account.getBalance();
  }

  async transferNear(vaultId: string, amountYocto: string): Promise<{ txHash?: string }> {
    const { actions } = await import('near-api-js');
    const outcome = await this.account.signAndSendTransaction({
      receiverId: vaultId,
      actions: [actions.transfer(BigInt(amountYocto))],
    });
    return { txHash: transactionHash(outcome) };
  }

  async transferFt(
    tokenId: string,
    receiverId: string,
    amount: string,
  ): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(tokenId, 'ft_transfer', {
          receiver_id: receiverId,
          amount,
        }, 1n),
      ),
    };
  }

  async getFtBalance(tokenId: string, accountId: string): Promise<string> {
    const value = await this.view<string>(tokenId, 'ft_balance_of', { account_id: accountId });
    return value ?? '0';
  }

  async createVault(opts: CreateVaultOptions): Promise<{ txHash?: string; vaultId: string }> {
    const { actions } = await import('near-api-js');
    const ownerId = opts.ownerId ?? this.accountId;
    const txActions = [
      actions.createAccount(),
      actions.transfer(opts.fundingYocto ?? 3_000_000_000_000_000_000_000_000n),
      actions.deployContract(opts.wasm),
      actions.functionCall('new', { owner_id: ownerId }, teraToGas('30'), 0n),
    ];
    if (opts.devMode) {
      txActions.push(
        actions.addFullAccessKey(KeyPair.fromString(this.privateKey as KeyPairString).getPublicKey()),
      );
    }
    const outcome = await this.account.signAndSendTransaction({
      receiverId: opts.vaultId,
      actions: txActions,
    });
    return { txHash: transactionHash(outcome), vaultId: opts.vaultId };
  }

  async addAgent(
    vaultId: string,
    args: {
      publicKey: string;
      name: string;
      policy: Policy;
      allowanceYocto?: string;
    },
  ): Promise<{ txHash?: string }> {
    const outcome = await this.call(vaultId, 'add_agent', {
      public_key: args.publicKey,
      name: args.name,
      policy: args.policy,
      allowance_yocto: args.allowanceYocto ?? '1000000000000000000000000',
    });
    return { txHash: transactionHash(outcome) };
  }

  async updatePolicy(
    vaultId: string,
    publicKey: string,
    policy: Policy,
  ): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(vaultId, 'update_policy', { public_key: publicKey, policy }),
      ),
    };
  }

  async setAllowance(
    vaultId: string,
    publicKey: string,
    allowanceYocto: string,
  ): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(vaultId, 'set_allowance', {
          public_key: publicKey,
          allowance_yocto: allowanceYocto,
        }),
      ),
    };
  }

  async freezeAgent(vaultId: string, publicKey: string): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(await this.call(vaultId, 'freeze_agent', { public_key: publicKey })),
    };
  }

  async unfreezeAgent(vaultId: string, publicKey: string): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(await this.call(vaultId, 'unfreeze_agent', { public_key: publicKey })),
    };
  }

  async revokeAgent(vaultId: string, publicKey: string): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(await this.call(vaultId, 'revoke_agent', { public_key: publicKey })),
    };
  }

  async pause(vaultId: string): Promise<{ txHash?: string }> {
    return { txHash: transactionHash(await this.call(vaultId, 'pause', {})) };
  }

  async unpause(vaultId: string): Promise<{ txHash?: string }> {
    return { txHash: transactionHash(await this.call(vaultId, 'unpause', {})) };
  }

  async approveRequest(vaultId: string, requestId: number): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(vaultId, 'approve_request', { request_id: requestId }),
      ),
    };
  }

  async rejectRequest(vaultId: string, requestId: number): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(vaultId, 'reject_request', { request_id: requestId }),
      ),
    };
  }

  async setExecutor(vaultId: string, executorId: string | null): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(await this.call(vaultId, 'set_executor', { account_id: executorId })),
    };
  }

  /**
   * Delete a key from an account. Used to lock a vault after setup: removing the
   * owner's full-access key leaves the vault with no keys at all. The owner
   * account still signs owner-method calls from its own account.
   */
  async deleteKey(accountId: string, publicKey: string): Promise<{ txHash?: string }> {
    const { actions } = await import('near-api-js');
    const outcome = await this.account.signAndSendTransaction({
      receiverId: accountId,
      actions: [actions.deleteKey(PublicKey.fromString(publicKey))],
    });
    return { txHash: transactionHash(outcome) };
  }

  async executeCrosschain(
    vaultId: string,
    requestId: number,
    depositAddress: string,
  ): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(vaultId, 'execute_crosschain', {
          request_id: requestId,
          deposit_address: depositAddress,
        }),
      ),
    };
  }

  async reportCrosschainResult(
    vaultId: string,
    requestId: number,
    outcome: 'DELIVERED' | 'REFUNDED' | 'FAILED',
    settlementRef: string,
  ): Promise<{ txHash?: string }> {
    return {
      txHash: transactionHash(
        await this.call(vaultId, 'report_crosschain_result', {
          request_id: requestId,
          outcome,
          settlement_ref: settlementRef,
        }),
      ),
    };
  }

  async view<T>(vaultId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
    return (await this.provider.callFunction({
      contractId: vaultId,
      method,
      args,
    })) as T;
  }

  async getOwner(vaultId: string): Promise<string> {
    return this.view<string>(vaultId, 'get_owner');
  }

  async getAgents(vaultId: string): Promise<Array<{ public_key: string; agent: Agent }>> {
    return this.view(vaultId, 'get_agents', { from_index: 0, limit: 100 });
  }

  async getRequests(
    vaultId: string,
    fromId = 0,
    limit = 50,
    reverse = false,
  ): Promise<PaymentRequest[]> {
    return this.view(vaultId, 'get_requests', { from_id: fromId, limit, reverse });
  }

  async getPendingRequests(vaultId: string): Promise<PaymentRequest[]> {
    return this.view(vaultId, 'get_pending_requests');
  }

  async getStorageInfo(
    vaultId: string,
  ): Promise<{ balance: string; storage_reserve: string; spendable: string }> {
    return this.view(vaultId, 'get_storage_info');
  }

  private async call(
    vaultId: string,
    methodName: string,
    args: Record<string, unknown>,
    deposit = 0n,
  ) {
    return this.account.callFunction({
      contractId: vaultId,
      methodName,
      args,
      gas: teraToGas('100'),
      deposit,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export * from './keygen.js';
