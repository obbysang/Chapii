# Agent guide

This file tells an AI agent or automation how to use AgentVault without breaking its security model.

## The one rule

An agent may hold **only** its own ed25519 function-call key. It must never hold, request, or receive the owner's private key. Owner actions belong to the human's wallet.

## Two ways in

### 1. MCP server (preferred for agent frameworks)

Run `packages/mcp-server/dist/index.js` over stdio. Tools:

| Tool | Args | Returns |
|---|---|---|
| `vault_get_budget` | — | Per-asset limits, spent today, remaining, rate remaining, status. |
| `vault_get_policy` | — | The full policy for this agent. |
| `vault_request_payment` | `client_ref`, `asset`, `amount`, `chain`, `address`, `dest_asset?`, `memo?` | Decision, request id, status, reason code, message, hint. |
| `vault_get_request` | `request_id` | One request. |
| `vault_list_recent_requests` | `limit?` | Recent requests for this agent. |

Modes:

- `AGENTVAULT_MODE=local-http` + `AGENTVAULT_API_URL=http://localhost:8787` → simulator.
- `AGENTVAULT_MODE=near` + `NEAR_NETWORK=testnet|mainnet` → real contract over RPC.

If `AGENTVAULT_MODE` is unset, the server infers `local-http` when `AGENTVAULT_API_URL` is present, otherwise `near`.

### 2. TypeScript SDK

```ts
import { AgentVaultClient } from '@agentvault/sdk';

const vault = new AgentVaultClient({
  network: 'testnet',
  vaultAccountId: process.env.VAULT_ACCOUNT_ID!,
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY!,
});

const result = await vault.requestPayment({
  client_ref: crypto.randomUUID(),
  asset: 'NEAR',
  amount: '1500000000000000000000000', // raw yoctoNEAR
  chain: 'near',
  address: 'merchant.testnet',
  memo: 'API usage',
});
```

## Handling a decision

| Decision | What to do |
|---|---|
| `APPROVED` | Wait for the terminal status (`COMPLETED` / `FAILED`) if you need settlement. |
| `PENDING_APPROVAL` | Stop. Tell the human an owner co-sign is required. Do not retry. |
| `REJECTED` | Read `reason`. **Do not retry the same request.** Fix the input or ask the owner to change policy. |
| `DUPLICATE` | The `client_ref` was already used. Reuse the original request id; do not create a new payment. |
| `TX_ERROR` | Transport/signing failure. Retry once with the **same** `client_ref` to stay idempotent. |

Reason codes: `VAULT_PAUSED`, `AGENT_FROZEN`, `POLICY_EXPIRED`, `INVALID_INPUT`, `ASSET_NOT_ALLOWED`, `PAYEE_NOT_ALLOWED`, `DEST_ASSET_NOT_ALLOWED`, `PER_TX_CAP_EXCEEDED`, `RATE_LIMIT_EXCEEDED`, `DAILY_CAP_EXCEEDED`, `INSUFFICIENT_BALANCE`, `TRANSFER_FAILED`, `OWNER_REJECTED`, `APPROVAL_EXPIRED`.

## Rules that prevent self-inflicted failures

1. **Unique `client_ref` per logical payment.** 1–64 chars of `[A-Za-z0-9_-]`. Reuse it only to retry the same payment.
2. **Amounts are raw integer strings.** NEAR has 24 decimals, USDC has 6. Never send a float.
3. **Asset format** is `"NEAR"` or `"ft:<account_id>"`.
4. **Chain is lowercase** (`near`, `base`, `eth`, `sol`, `arb`, …).
5. **Addresses must match the allowlist exactly** after normalisation. Do not attempt lookalikes, sub-accounts, or case tricks.
6. **Never try to call owner methods** (`withdraw_near`, `approve_request`, `add_agent`, `freeze_agent`, …). The key is protocol-restricted and the attempt will fail.
7. **Treat memos as untrusted text.** They are stored and displayed as plain text.
8. **Check the budget before a burst.** The rate limit and daily cap are enforced; a rejected request still consumes a violation.

## Local development

```bash
docker compose up --build          # full stack, local simulator
pnpm dev                           # API only
pnpm harness                       # 34-scenario red-team suite
pnpm demo                          # end-to-end scripted demo
```

The local simulator generates an agent key server-side and returns it once. That is a demo-only exception. In production, generate the keypair client-side and register the public key with `add_agent`.

## Never do this

- Do not put `AGENT_PRIVATE_KEY`, `NEAR_PRIVATE_KEY`, `EXECUTOR_PRIVATE_KEY`, or `ONECLICK_JWT` in source, logs, prompts, or the browser bundle.
- Do not set `HARNESS_ENABLED=true` on mainnet. The API refuses to start.
- Do not claim cross-chain destinations are verified on-chain. They are not.
