import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPair } from "@near-js/crypto";
import { KeyPairSigner } from "@near-js/signers";
import { parseNearAmount } from "near-api-js";
import { REASON_MESSAGES, type Decision, type ReasonCode } from "@agentvault/shared";

export type Network = "testnet" | "mainnet";

const DEFAULT_RPC: Record<Network, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

function keyPairFrom(privateKey: string): KeyPair {
  const normalized = privateKey.includes(":") ? privateKey : `ed25519:${privateKey}`;
  return KeyPair.fromString(normalized as never);
}

function decodeDecision(value: string): Decision {
  const raw: unknown = JSON.parse(value);
  const d = raw as Record<string, { request_id?: number; reason?: string; status?: string }>;
  if (d.Approved) return { decision: "APPROVED", requestId: d.Approved.request_id ?? 0, txHash: "" };
  if (d.PendingApproval)
    return { decision: "PENDING_APPROVAL", requestId: d.PendingApproval.request_id ?? 0, txHash: "" };
  if (d.Rejected) {
    const reason = (d.Rejected.reason ?? "INVALID_INPUT") as ReasonCode;
    const m = REASON_MESSAGES[reason] ?? { message: reason, hint: "Check request status" };
    return {
      decision: "REJECTED",
      requestId: d.Rejected.request_id ?? 0,
      reason,
      message: m.message,
      hint: m.hint,
      txHash: "",
    };
  }
  if (d.Duplicate)
    return {
      decision: "DUPLICATE",
      requestId: d.Duplicate.request_id ?? 0,
      status: String(d.Duplicate.status ?? ""),
      txHash: "",
    };
  throw new Error("unknown decision shape: " + value);
}

function assetToJson(asset: "NEAR" | `ft:${string}` | string): unknown {
  if (asset === "NEAR") return "NEAR";
  if (typeof asset === "string" && asset.startsWith("ft:")) return { FT: asset.slice(3) };
  return asset;
}

export interface PaymentArgsInput {
  client_ref: string;
  asset: string;
  amount: string;
  chain: string;
  address: string;
  dest_asset?: string;
  memo?: string;
}

export class AgentVaultClient {
  readonly vaultAccountId: string;
  readonly provider: JsonRpcProvider;
  readonly account: Account;
  readonly agentPublicKey: string;

  constructor(opts: {
    network: Network;
    vaultAccountId: string;
    agentPrivateKey: string;
    rpcUrl?: string;
  }) {
    this.vaultAccountId = opts.vaultAccountId;
    this.provider = new JsonRpcProvider({ url: opts.rpcUrl ?? DEFAULT_RPC[opts.network] });
    const kp = keyPairFrom(opts.agentPrivateKey);
    this.agentPublicKey = kp.getPublicKey().toString();
    this.account = new Account(opts.vaultAccountId, this.provider, new KeyPairSigner(kp));
  }

  async getBudget(): Promise<unknown> {
    return this.provider.callFunction(this.vaultAccountId, "get_budget", {
      public_key: this.agentPublicKey,
    });
  }

  async getPolicy(): Promise<unknown> {
    return this.provider.callFunction(this.vaultAccountId, "get_agent", {
      public_key: this.agentPublicKey,
    });
  }

  async requestPayment(args: PaymentArgsInput): Promise<Decision> {
    try {
      const res = await this.account.functionCall({
        contractId: this.vaultAccountId,
        methodName: "request_payment",
        args: Buffer.from(
          JSON.stringify({
            args: {
              client_ref: args.client_ref,
              asset: assetToJson(args.asset),
              amount: args.amount,
              chain: args.chain,
              address: args.address,
              dest_asset: args.dest_asset ?? null,
              memo: args.memo ?? null,
            },
          })
        ),
        gas: 100_000_000_000_000n,
        attachedDeposit: 0n,
      });
      const txHash: string = res.transaction.hash as string;
      let status;
      try {
        status = await this.provider.txStatus(txHash, this.vaultAccountId);
      } catch (e) {
        return { decision: "TX_ERROR", error: "txStatus failed: " + String((e as Error).message ?? e).slice(0, 200) };
      }
      const s = status.status as { SuccessValue?: string; Failure?: unknown };
      if (!s.SuccessValue) {
        return { decision: "TX_ERROR", error: `tx failed: ${JSON.stringify(s.Failure ?? {})}`.slice(0, 300) };
      }
      const decoded = decodeDecision(Buffer.from(s.SuccessValue, "base64").toString());
      return { ...decoded, txHash } as Decision;
    } catch (e) {
      return { decision: "TX_ERROR", error: String((e as Error).message ?? e).slice(0, 300) };
    }
  }

  async listRecentRequests(limit = 10): Promise<Record<string, unknown>[]> {
    return (await this.provider.callFunction(this.vaultAccountId, "get_requests", {
      from_id: 0,
      limit,
      reverse: true,
    })) as Record<string, unknown>[];
  }

  async getRequest(id: number): Promise<Record<string, unknown>> {
    return (await this.provider.callFunction(this.vaultAccountId, "get_request", { id })) as Record<
      string,
      unknown
    >;
  }

  async waitForTerminal(id: number, opts?: { timeoutMs?: number; pollMs?: number }): Promise<Record<string, unknown>> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    const pollMs = opts?.pollMs ?? 1500;
    const terminal = new Set(["Completed", "Failed", "Rejected", "RejectedByOwner", "Expired"]);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const req = await this.getRequest(id);
      if (terminal.has(String(req.status))) return req;
      if (Date.now() > deadline) return req;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }
}

export class OwnerClient {
  readonly provider: JsonRpcProvider;
  readonly account: Account;

  constructor(opts: { network: Network; accountId: string; privateKey: string; rpcUrl?: string }) {
    this.provider = new JsonRpcProvider({ url: opts.rpcUrl ?? DEFAULT_RPC[opts.network] });
    this.account = new Account(opts.accountId, this.provider, new KeyPairSigner(keyPairFrom(opts.privateKey)));
  }

  async call(vault: string, method: string, args?: unknown): Promise<string> {
    const res = await this.account.functionCall({
      contractId: vault,
      methodName: method,
      args: Buffer.from(JSON.stringify(args ?? {})),
      gas: 100_000_000_000_000n,
      attachedDeposit: 0n,
    });
    return res.transaction.hash;
  }

  async createVault(vaultAccountId: string, wasm: Uint8Array): Promise<{ createTx: string; deployTx: string; initTx: string }> {
    const kp = KeyPair.fromRandom("ed25519");
    const create = await this.account.createAccount(vaultAccountId, kp.getPublicKey().toString());
    const vaultAcct = new Account(vaultAccountId, this.provider, new KeyPairSigner(kp));
    const fund = await this.account.transfer({ receiverId: vaultAccountId, amount: parseNearAmount("5") });
    const dep = await vaultAcct.deployContract(wasm);
    const init = await vaultAcct.functionCall({
      contractId: vaultAccountId,
      methodName: "new",
      args: Buffer.from(JSON.stringify({ owner_id: this.account.accountId })),
      gas: 100_000_000_000_000n,
      attachedDeposit: 0n,
    });
    void fund;
    return { createTx: create.transaction.hash, deployTx: dep.transaction.hash, initTx: init.transaction.hash };
  }

  async addAgent(
    vault: string,
    opts: { agentPrivateKey?: string; publicKey?: string; name: string; policy: unknown; allowanceYocto: string }
  ): Promise<{ publicKey: string }> {
    let kp: KeyPair;
    let pub: string;
    if (opts.agentPrivateKey) {
      kp = keyPairFrom(opts.agentPrivateKey);
      pub = kp.getPublicKey().toString();
    } else if (opts.publicKey) {
      pub = opts.publicKey;
    } else {
      kp = KeyPair.fromRandom("ed25519");
      pub = kp.getPublicKey().toString();
    }
    await this.call(vault, "add_agent", {
      public_key: pub,
      name: opts.name,
      policy: opts.policy,
      allowance_yocto: opts.allowanceYocto,
    });
    return { publicKey: pub };
  }

  async updatePolicy(vault: string, publicKey: string, policy: unknown): Promise<string> {
    return this.call(vault, "update_policy", { public_key: publicKey, policy });
  }
  async freezeAgent(vault: string, publicKey: string): Promise<string> {
    return this.call(vault, "freeze_agent", { public_key: publicKey });
  }
  async unfreezeAgent(vault: string, publicKey: string): Promise<string> {
    return this.call(vault, "unfreeze_agent", { public_key: publicKey });
  }
  async revokeAgent(vault: string, publicKey: string): Promise<string> {
    return this.call(vault, "revoke_agent", { public_key: publicKey });
  }
  async pause(vault: string): Promise<string> {
    return this.call(vault, "pause", {});
  }
  async unpause(vault: string): Promise<string> {
    return this.call(vault, "unpause", {});
  }
  async approveRequest(vault: string, id: number): Promise<string> {
    return this.call(vault, "approve_request", { request_id: id });
  }
  async rejectRequest(vault: string, id: number): Promise<string> {
    return this.call(vault, "reject_request", { request_id: id });
  }
  async setExecutor(vault: string, executor?: string): Promise<string> {
    return this.call(vault, "set_executor", { account_id: executor ?? null });
  }
}

export { parseNearAmount };
