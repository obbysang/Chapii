# Architecture

AgentVault is a monorepo with one authoritative policy engine (the Rust contract), a TypeScript read model and operator API, a React dashboard, and agent-facing SDK/MCP surfaces. The API is never allowed to be the enforcement point for money movement.

## Component map

| Component | Path | Responsibility |
|---|---|---|
| Vault contract | `contracts/vault` | Owns funds, stores agents/policies/requests, evaluates every payment, emits events. |
| Mock FT | `contracts/mock-ft` | Minimal NEP-141 token for testnet and sandbox demos. |
| Shared | `packages/shared` | Types, zod schemas, reason codes, exact `u128` formatting. |
| SDK | `packages/sdk` | `AgentVaultClient` for agent keys, `OwnerClient` for owner keys. |
| Localchain | `packages/localchain` | Deterministic in-process emulator of the contract policy and balances. |
| Harness | `packages/harness` | 27 attack + 7 control scenarios, local and real-chain backends. |
| MCP server | `packages/mcp-server` | Five stdio tools for any MCP-capable agent framework. |
| Demo agent | `packages/demo-agent` | Scripted good/attack flows, optional LLM injection demo. |
| API | `apps/api` | Fastify REST + SSE, Prisma/Postgres read model, indexer, executor, harness runner. |
| Web | `apps/web` | Public landing/demo and owner console. Wallet actions signed in browser. |

## Two runtime modes

`NEAR_NETWORK` selects the mode. The UI always shows which one is active.

### `local` (default, no secrets)

```
web ──► API ──► localchain emulator (in-process, deterministic)
                  │
                  ├── policy decisions + receipts
                  ├── simulated balances
                  └── simulated cross-chain settlement
```

- The API seeds `demo.agentvault.testnet` on startup.
- The simulator generates demo agent keys server-side and returns the private key once. This is a demo-only exception, labelled in the UI.
- No chain calls, no RPC, no wallet required for read-only or demo flows.
- The red-team harness runs in-process against an ephemeral simulator vault cloned from the demo balances.

### `testnet` / `mainnet` (real NEAR)

```
browser wallet ──signed tx──► NEAR RPC ──► vault contract
                                              │ events / views
agent key ──request_payment──► vault contract  │
                                              ▼
                                         API indexer ──► Postgres ──► SSE ──► web
```

- The API is a read model plus an operator surface. It never holds the owner key.
- Vault registration verifies `get_owner()` and `get_agents()` on-chain before indexing.
- The indexer polls `get_changes_since(cursorSeq)` and upserts receipts idempotently.
- Owner actions (add agent, freeze, revoke, approve, pause, withdraw) are wallet transactions from the browser.
- The harness uses a throwaway funder key (`HARNESS_OWNER_*`) to provision ephemeral agents on a testnet vault. It is forced off on mainnet.

## Contract design

### Identity

- The vault is a NEAR account. In locked mode it has **zero full-access keys**.
- Each agent is identified by an ed25519 public key registered in the contract.
- The agent's key is a **function-call access key** on the vault account with:
  - receiver = the vault account itself,
  - method = `request_payment`,
  - a small allowance.
- Because the key is scoped by the protocol, the agent cannot call `withdraw_near`, `approve_request`, `add_agent`, another contract, or attach a deposit.
- `request_payment` asserts `predecessor_account_id == current_account_id` and resolves the agent from `signer_account_pk()`.

### State

```
owner_id, executor_id, paused
agents:      Map<PublicKey, Agent>
requests:    Map<u64, PaymentRequest>
client_refs: Map<"<agent_pk>|<client_ref>", request_id>
next_request_id, change_seq, change_log: Map<seq, request_id>
```

Each `Agent` stores its `Policy`, status, per-asset usage counters, rate counters, and violation counters. Windows are fixed buckets derived from `block_timestamp`.

### Decision order

`request_payment` evaluates deterministically and **never panics on a policy violation** (a panic would revert the receipt that records the rejection):

1. vault paused → `VAULT_PAUSED`
2. agent missing/frozen/revoked → `AGENT_FROZEN`
3. policy expired → `POLICY_EXPIRED`
4. malformed input → `INVALID_INPUT`
5. replay of `client_ref` → `Duplicate` (no side effects)
6. asset not in limits → `ASSET_NOT_ALLOWED`
7. payee not allowlisted after normalisation → `PAYEE_NOT_ALLOWED`
8. destination asset not allowed → `DEST_ASSET_NOT_ALLOWED`
9. amount > per-tx cap → `PER_TX_CAP_EXCEEDED`
10. rate limit exceeded → `RATE_LIMIT_EXCEEDED`
11. amount would exceed daily cap → `DAILY_CAP_EXCEEDED`
12. insufficient spendable balance → `INSUFFICIENT_BALANCE`
13. amount ≥ co-sign threshold → `PENDING_APPROVAL`
14. same-chain → `APPROVED` + transfer promise; cross-chain → `AWAITING_EXECUTION`

Violations increment the per-hour counter; reaching `freeze_after_violations` freezes the agent automatically.

### Owner methods

`add_agent`, `update_policy`, `set_allowance`, `freeze_agent`, `unfreeze_agent`, `revoke_agent`, `pause`, `unpause`, `set_executor`, `approve_request`, `reject_request`, `expire_request`, `withdraw_near`, `withdraw_ft`, `prune_requests`.

`revoke_agent` is permanent and issues a `DeleteKey` promise. Freezing preserves the key so the owner can unfreeze.

### Events and views

Every state transition emits a NEP-297-style event:

```
EVENT_JSON:{"standard":"agentvault","version":"1.0.0","event":"payment_approved","data":[{...}]}
```

Views: `get_owner`, `get_executor`, `is_paused`, `get_version`, `get_next_request_id`, `get_change_seq`, `get_agents`, `get_agent`, `get_budget`, `get_request`, `get_requests`, `get_pending_requests`, `get_changes_since`, `get_storage_info`.

## Data flows

### F1 — Register a vault

1. Owner deploys the contract (batched create + transfer + deploy + `new`).
2. Web calls `POST /vaults { vaultId }`.
3. API verifies owner and agents on-chain, inserts the vault, starts indexing.
4. Indexer polls `get_changes_since` and writes receipts.

### F2 — Add an agent

1. Web generates an ed25519 keypair **client-side**.
2. Wallet signs `add_agent(public_key, name, policy, allowance_yocto)`.
3. Contract validates the policy, stores the agent, and creates a function-call access key scoped to `request_payment`.
4. The private key is shown once and never sent to the API.

### F3 — Same-chain payment

1. Agent signs `request_payment` as the vault account with its function-call key.
2. Contract evaluates policy. Approved → debit usage counters and issue a `Transfer`/`ft_transfer` promise.
3. Callback `on_payment_resolved` marks `COMPLETED` or reverts counters and marks `FAILED`.
4. Indexer records the receipt; SSE pushes it to the dashboard.

### F4 — Cross-chain payout

1. Contract approves and sets `AWAITING_EXECUTION` (it does not transfer yet).
2. API executor requests a 1-Click quote with the payee as destination.
3. Executor calls `execute_crosschain(request_id, deposit_address)`; the contract transfers to the deposit address and sets `EXECUTING`.
4. Executor polls 1-Click and calls `report_crosschain_result`.
5. Dashboard compares the reported destination against the allowlisted `(chain, address, dest_asset)` and flags mismatches.

The executor key can only report settlement. It cannot create or approve requests. In local mode the executor simulates the same state machine with a `sim-local-...` deposit address that can never receive real value.

### F5 — Incident response

Owner calls `freeze_agent`, `revoke_agent`, or `pause` from the wallet. The API reflects the state on the next index tick and emits SSE. Revocation deletes the key.

### F6 — Fund from another chain

`POST /intents/fund-quote` asks 1-Click for a deposit address with `recipient = vaultId`. The UI shows the address and polls status. In local mode the endpoint returns a clearly simulated quote.

## API internals

| Service | File | Notes |
|---|---|---|
| Read model | `apps/api/src/services/vault-service.ts` | Summary, agents, budgets, receipts, approvals, local actions, seeding. |
| Indexer | `apps/api/src/services/indexer.ts` | Real-chain polling, exponential backoff, health degradation. |
| Executor | `apps/api/src/services/executor.ts` | Local simulation and real 1-Click state machine. |
| Harness runner | `apps/api/src/services/harness.ts` | Concurrency 1 per vault, per-IP hourly limit, SSE progress, DB persistence. |
| SSE hub | `apps/api/src/lib/sse.ts` | Per-vault subscriber set, heartbeat, sequence numbers. |
| Intents | `apps/api/src/services/intents.ts` | 1-Click config, quote, status, token list. |

### SSE

`GET /vaults/:id/stream` returns `text/event-stream`. Events include `hello`, `request.created`, `request.updated`, `agent.updated`, `vault.updated`, `harness.started`, `harness.progress`, `harness.finished`, and heartbeats. Nginx disables buffering and sets a one-hour read timeout for this path.

## Trust boundaries

| Boundary | Trusted for | Not trusted for |
|---|---|---|
| Contract | Policy decisions, balance accounting, key restrictions | Cross-chain destination truth |
| NEAR protocol | Key scoping (receiver + method) | Policy semantics |
| API | Read model, indexing, quotes, harness orchestration | Moving owner funds, approving requests |
| Executor hot key | Reporting settlement | Creating or approving payments |
| Browser wallet | Owner signatures | Policy enforcement |
| Local simulator | Demo behaviour | Production security |

## Deployment shape

```
docker compose
├── db     postgres:16-alpine          (private network, healthcheck)
├── api    Dockerfile.api              (Prisma db push, Fastify on 8787)
└── web    Dockerfile.web + nginx      (static SPA, /api proxy, /docs)
```

- `web` waits for `api` health; `api` waits for `db` health.
- The API runs `prisma db push --skip-generate` at startup for this single-service demo. A long-lived deployment should use `prisma migrate deploy`.
- Nginx strips `/api`, disables buffering for SSE, and serves the docs directory at `/docs`.
