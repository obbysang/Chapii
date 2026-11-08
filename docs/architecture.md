# AgentVault Architecture

## Diagram

```
Browser (owner wallet) ──wallet-signed txs──▶ NEAR (testnet/mainnet)
        ▲ views/RPC                              │  ┌────────────────────┐
Web app ──▶ API (NestJS) ──poll───────────────▶ │  │ Vault contract     │
        │  indexer, executor,   executor txs    │  │ (Rust, locked: no  │
        │  intents proxy, harness               │  │  full-access keys) │
        └──────▶ Postgres ◀───────────────────── │  └─────────▲──────────┘
                    ▲                            │  agent fn-call key   │
                   read-model                    │  ┌───────┴────────┐  │
                                                 │  │ Agent (MCP/SDK)│  │
                                                 │  └────────────────┘  │
                                                 └──────┬────────────────┘
                                                        │
NEAR Intents 1-Click API ◀── executor ────────────────┘
```

## Source of truth
On-chain contract state is authoritative for money, policy and requests. The database is a read-model + job queue. When they disagree, the chain wins.

## Contract (`contracts/vault`, near-sdk 5.30.1)
- State: owner, executor, pause flag, per-agent policy/usage/rate/violation buckets, requests, per-agent `client_ref` idempotency keys, change log (`get_changes_since`).
- Deterministic evaluation order (§4.5 of the spec): duplicate → rate-bump → paused → frozen → expired → invalid → asset → payee/dest → per-tx → rate → daily → balance → co-sign → approve (NEAR/FT transfer promise or cross-chain `AwaitingExecution`).
- Policy violations never panic; they are recorded with a `ReasonCode` and count toward auto-freeze (steps 4–10).
- Identity: agent calls happen as the vault account via the restricted function-call key; `signer_account_pk()` identifies the agent (verified on testnet in Phase 0).

## SDK (`packages/sdk`) and MCP (`packages/mcp-server`)
- `AgentVaultClient`: signs as the vault account with the agent key; maps `TX_ERROR` instead of throwing on protocol rejections.
- `OwnerClient`: owner-side transactions (used by scripts/harness; mirrors web actions).
- MCP stdio server exposes 5 tools (`vault_get_budget`, `vault_get_policy`, `vault_request_payment`, `vault_get_request`, `vault_list_recent_requests`).

## API (`apps/api`)
- Indexer polls `get_changes_since(cursor_seq)` and upserts into Postgres keyed by `(vaultId, onchainId)`; emits SSE (`connected`, `request.created`, `request.updated`).
- Executor: state machine `QUEUED → QUOTING → QUOTED → FUNDING → FUNDED → POLLING → DELIVERED | REFUNDED | FAILED`; quote recipient/amount sanity checks; `report_crosschain_result`.
- Harness runner (in-app): runs the attack suite against the demo vault.

## Web (`apps/web`)
- Public read-only pages work without a wallet; owner actions gate on `owner_id == connected account`.
- Create-vault wizard: name validation, batched create tx (with sequential fallback), client-side key generation, secret modal.
- Feed uses SSE with polling fallback; destructive actions require confirmation (typed agent name for revoke).
