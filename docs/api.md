# AgentVault API

Base: `https://<api-host>` (local default `http://localhost:3100`). All responses are JSON; errors are `{ error: { code, message } }` where applicable.

## Health
`GET /health` → `{ ok, chain, db, indexerLagMs }`

## Vaults
| Method | Path | Description |
|---|---|---|
| POST | `/vaults` | Register `{ vaultId }`; verifies the contract via `get_owner` |
| GET | `/vaults?owner=<accountId>` | Registered vaults for an owner |
| GET | `/vaults/:id/summary` | Aggregates (counts, spend, agents, storage) |
| GET | `/vaults/:id/agents` | On-chain agent list |
| GET | `/vaults/:id/requests?cursor=&limit=&status=` | Cursor-paginated feed (indexed rows) |
| GET | `/vaults/:id/requests/:requestId` | One indexed request |
| GET | `/vaults/:id/stream` | SSE: `connected`, `request.created`, `request.updated` |

Request rows include: `onchainId`, `clientRef`, `asset`, `amount` (full-digit yocto string), `chain`, `address`, `status` (`COMPLETED`/`REJECTED`/`PENDING_APPROVAL`/…), `reason` (`PAYEE_NOT_ALLOWED` etc.), `createdAt`, `decidedAt`.

## Intents (P1)
| Method | Path | Description |
|---|---|---|
| POST | `/intents/fund-quote` | 1-Click quote with `recipient = vaultId` → `{ depositAddress, expiresAt, expectedOut, … }` |
| GET | `/intents/status?depositAddress=` | 1-Click execution status |
| GET | `/intents/tokens` | First 200 supported tokens |

## Harness (P1)
| Method | Path | Description |
|---|---|---|
| POST | `/harness/runs` | `{ vaultId }` → `{ runId }` (testnet only; rate-limited) |
| GET | `/harness/runs/:runId` | Progress + per-scenario results |
| GET | `/harness/runs/latest?vaultId=` | Latest completed report |

## Security notes
helmet, strict CORS (`CORS_ORIGINS`), zod on inputs, no secrets in logs. Owner actions are wallet-signed on-chain txs from the browser; the API never holds owner keys. The 1-Click JWT (optional) is server-side only.
