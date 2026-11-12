# API reference

Base URL: `http://localhost:8787` in development, `/api` behind the Docker web container.

All request bodies are JSON. All inputs are validated with zod; unknown keys are rejected for payment args. Amounts are **raw integer strings** in the asset's smallest unit (`u128`), never floats.

## Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "amount: must be > 0",
    "details": []
  }
}
```

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query failed schema validation. |
| 400 | `INVALID_REQUEST` | Domain-level invalid request. |
| 403 | `HARNESS_DISABLED` | Attack suite disabled by config. |
| 403 | `HARNESS_MAINNET` | Attack suite refuses to run on mainnet. |
| 404 | `NOT_FOUND` | Vault, agent, request or run not found. |
| 409 | `HARNESS_BUSY` | A run is already active for this vault. |
| 429 | `HARNESS_RATE_LIMITED` | Per-IP harness limit reached. |
| 429 | `RATE_LIMITED` | Global per-route rate limit reached. |
| 500 | `INTERNAL_ERROR` | Unexpected server error. |
| 503 | `DISABLED` | Feature not configured (e.g. Intents without credentials). |

## Health and metadata

### `GET /`

```json
{ "name": "AgentVault API", "version": "1.0.0", "docs": "/health", "mode": "local" }
```

### `GET /health`

```json
{
  "status": "ok",
  "mode": "local",
  "network": "testnet",
  "chain": "ok",
  "db": "ok",
  "indexerLagMs": 1200,
  "version": "1.0.0",
  "demoVaultId": "demo.agentvault.testnet",
  "harnessEnabled": true,
  "timestamp": "2026-11-11T06:49:12.586Z"
}
```

`mode` is `local` for the simulator and `near` for real RPC. `chain` is `ok` if the RPC is reachable or if the simulator is active.

## Vaults

### `POST /vaults`

Register a real NEAR vault. The API verifies `get_owner()` and `get_agents()` on-chain before inserting it.

```json
{ "vaultId": "demo.agentvault.testnet", "label": "Demo vault" }
```

Returns `201` with a `VaultSummary`.

### `POST /local/vaults`

Create a simulator vault. **Local mode only.**

```json
{
  "label": "Demo run",
  "ownerId": "demo-owner.testnet",
  "fundingNear": "25",
  "fundUsdc": "100"
}
```

Returns `201` with a `VaultSummary`.

### `GET /vaults?owner=<accountId>`

```json
{ "items": [ { "vaultId": "demo.agentvault.testnet", "mode": "local", "...": "..." } ] }
```

### `GET /vaults/:id/summary`

```json
{
  "vaultId": "demo.agentvault.testnet",
  "mode": "local",
  "network": "testnet",
  "ownerId": "demo-owner.testnet",
  "label": "AgentVault public demo",
  "paused": false,
  "executorId": null,
  "balances": [
    { "asset": "NEAR", "amount": "244000000000000000000000000" },
    { "asset": "ft:usdc.testnet", "amount": "4188000000" }
  ],
  "storage": {
    "balance": "244000000000000000000000000",
    "storage_reserve": "50000000000000000000000",
    "spendable": "243950000000000000000000000"
  },
  "agents": [
    {
      "publicKey": "ed25519:...",
      "name": "Research agent",
      "status": "ACTIVE",
      "policy": { "limits": [], "payees": [], "max_requests_per_hour": 12, "freeze_after_violations": 3, "expires_at_ns": null },
      "violations": 1,
      "createdAt": "2026-11-11T02:28:38.846Z"
    }
  ],
  "pendingApprovals": 1,
  "stats24h": { "approved": 5, "rejected": 1, "spent": "6000000000000000012000000" },
  "health": "ok",
  "contractVersion": "1.0.0",
  "updatedAt": "2026-11-11T06:49:12.586Z"
}
```

### `GET /vaults/:id/agents`

```json
{ "items": [ { "publicKey": "ed25519:...", "name": "Research agent", "status": "ACTIVE", "policy": {}, "violations": 1, "createdAt": "..." } ] }
```

### `GET /vaults/:id/agents/:pk`

Returns one `AgentViewResponse` or `404`. The public key must be URL-encoded (`ed25519%3A...`).

### `GET /vaults/:id/agents/:pk/budget`

```json
{
  "per_asset": [
    {
      "asset": "NEAR",
      "daily_max": "20000000000000000000000000",
      "spent_today": "0",
      "remaining": "20000000000000000000000000",
      "per_tx_max": "5000000000000000000000000",
      "cosign_above": "4000000000000000000000000"
    }
  ],
  "rate_remaining": 11,
  "violations": 0,
  "status": "ACTIVE",
  "expires_at_ns": null
}
```

### `GET /vaults/:id/requests`

Query: `cursor` (onchain id, exclusive upper bound), `limit` (1–100, default 25), `status`, `agent` (public key), `reason`, `q` (address/memo/client ref substring).

```json
{
  "items": [
    {
      "id": "cmwbi55aw005tcxf8ajnbtpax",
      "vaultId": "demo.agentvault.testnet",
      "onchainId": 7,
      "agentPublicKey": "ed25519:...",
      "agentName": "MCP Test Agent",
      "clientRef": "mcp-test-...",
      "asset": "NEAR",
      "amount": "1000000000000000000000000",
      "chain": "near",
      "address": "merchant.testnet",
      "destAsset": null,
      "memo": "MCP integration test",
      "status": "COMPLETED",
      "reason": null,
      "txHash": "local_demo_agentvault_testnet_7_12",
      "depositAddress": null,
      "settlementRef": null,
      "verification": "UNVERIFIED",
      "createdAt": "2026-11-11T02:28:38.846Z",
      "decidedAt": "2026-11-11T02:28:38.846Z",
      "jobState": null
    }
  ],
  "nextCursor": 6
}
```

`nextCursor` is `null` on the last page.

### `GET /vaults/:id/requests/:requestId`

Returns one `RequestDto` by **onchain id** (positive integer) or `404`.

### `GET /vaults/:id/approvals`

```json
{ "items": [ { "id": "...", "status": "PENDING_APPROVAL", "...": "..." } ] }
```

Oldest first. Requests expire after the approval window and settle as `EXPIRED`.

### `GET /vaults/:id/stream`

Server-Sent Events. `Content-Type: text/event-stream`.

```
event: hello
data: {"vaultId":"demo.agentvault.testnet"}

event: request.updated
data: {"onchainId":7,"status":"COMPLETED"}

event: harness.progress
data: {"runId":"...","index":12,"total":34,"scenarioId":"L3","passed":true}
```

Event names: `hello`, `request.created`, `request.updated`, `agent.updated`, `vault.updated`, `harness.started`, `harness.progress`, `harness.finished`, `heartbeat`.

## Local simulator mutations

These endpoints exist only when `mode=local`. They never move real funds.

### `POST /local/vaults/:id/agents`

```json
{
  "name": "Research agent",
  "policy": {
    "limits": [
      { "asset": "NEAR", "per_tx_max": "5000000000000000000000000", "daily_max": "20000000000000000000000000", "cosign_above": "4000000000000000000000000" }
    ],
    "payees": [
      { "label": "Acme API", "chain": "near", "address": "merchant.testnet", "allowed_dest_assets": [] }
    ],
    "max_requests_per_hour": 12,
    "freeze_after_violations": 3,
    "expires_at_ns": null
  },
  "allowanceYocto": "250000000000000000000000"
}
```

Returns `201`:

```json
{ "publicKey": "ed25519:...", "privateKey": "ed25519:...", "name": "Research agent" }
```

The private key is returned **once** and is not stored. Demo-only exception.

### `POST /local/vaults/:id/agents/:pk/requests`

```json
{
  "client_ref": "invoice-1042",
  "asset": "NEAR",
  "amount": "1500000000000000000000000",
  "chain": "near",
  "address": "merchant.testnet",
  "dest_asset": null,
  "memo": "API usage"
}
```

Returns a normalized result:

```json
{
  "decision": "APPROVED",
  "requestId": 8,
  "status": "COMPLETED",
  "reason": null,
  "message": "Payment approved",
  "hint": null,
  "txHash": "local_..."
}
```

`decision` is one of `APPROVED`, `PENDING_APPROVAL`, `REJECTED`, `DUPLICATE`, `TX_ERROR`.

### `POST /local/vaults/:id/actions`

Discriminated union on `type`:

| `type` | Extra fields |
|---|---|
| `pause` / `unpause` | — |
| `freeze_agent` / `unfreeze_agent` / `revoke_agent` | `publicKey` |
| `update_policy` | `publicKey`, `policy` |
| `approve_request` / `reject_request` | `requestId` |
| `set_executor` | `executorId` (string or `null`) |
| `withdraw` | `asset`, `amount`, `to` |

```json
{ "type": "freeze_agent", "publicKey": "ed25519:..." }
```

Returns the updated `VaultSummary`.

### `POST /local/vaults/:id/fund`

```json
{ "asset": "NEAR", "amount": "10000000000000000000000000" }
```

Returns `{ "ok": true }`.

### `POST /local/vaults/:id/executor`

```json
{ "executorId": "executor.testnet" }
```

Returns the updated `VaultSummary`.

## Harness

### `POST /harness/runs`

```json
{ "vaultId": "demo.agentvault.testnet" }
```

Returns `202`:

```json
{ "runId": "cmwbrfgcf0001cx4cdtzwk3ok" }
```

Constraints: `HARNESS_ENABLED=true`, not mainnet, one active run per vault, `HARNESS_PER_HOUR` per IP.

### `GET /harness/runs/latest?vaultId=<id>`

Returns the latest `HarnessRunDto` or `null`.

### `GET /harness/runs/:runId`

```json
{
  "id": "cmwbrfgcf0001cx4cdtzwk3ok",
  "vaultId": "demo.agentvault.testnet",
  "status": "DONE",
  "total": 34,
  "passed": 34,
  "controlsPassed": 7,
  "invariantsOk": true,
  "startedAt": "2026-11-11T09:50:00.000Z",
  "finishedAt": "2026-11-11T09:50:02.000Z",
  "results": [
    {
      "scenarioId": "P1",
      "category": "Payee allowlist",
      "title": "Pay a non-allowlisted NEAR account",
      "attack": "Compromised agent sends 1 NEAR to attacker.testnet.",
      "expected": "REJECTED:PAYEE_NOT_ALLOWED",
      "actual": "REJECTED:PAYEE_NOT_ALLOWED",
      "passed": true,
      "txHash": "local_...",
      "invariantsOk": true,
      "notes": null,
      "durationMs": 4
    }
  ]
}
```

### `GET /harness/runs/:runId/stream`

SSE stream for the run's vault. Emits `harness.progress` and `harness.finished`.

### `GET /vaults/:id/harness`

```json
{ "items": [ { "id": "...", "status": "DONE", "total": 34, "passed": 34, "...": "..." } ] }
```

## NEAR Intents

### `GET /intents/config`

```json
{ "enabled": false, "apiUrl": "https://1click.chaindefuser.com", "network": "testnet" }
```

### `POST /intents/fund-quote`

```json
{
  "vaultId": "demo.agentvault.testnet",
  "originAsset": "near:USDC",
  "destinationAsset": "near:USDC",
  "amount": "1000000",
  "refundTo": "you.testnet"
}
```

Returns an `IntentsQuote`. In local mode the deposit address is clearly simulated. With `ONECLICK_*` configured, this calls the real 1-Click API.

### `GET /intents/status?depositAddress=<address>`

Returns the provider status, or a simulated status in local mode.

### `GET /intents/tokens`

Returns the supported asset list (static fallback or provider list).

## SDK and MCP

The REST API is for the dashboard and demos. Agents should use the SDK or MCP server, which sign as the agent key and never require the owner key.

```ts
import { AgentVaultClient } from '@agentvault/sdk';

const client = new AgentVaultClient({
  network: 'testnet',
  vaultAccountId: 'demo.agentvault.testnet',
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY!,
});

const result = await client.requestPayment({
  client_ref: `invoice-${Date.now()}`,
  asset: 'NEAR',
  amount: '1500000000000000000000000',
  chain: 'near',
  address: 'merchant.testnet',
  memo: 'API usage',
});
```

MCP tools: `vault_get_budget`, `vault_get_policy`, `vault_request_payment`, `vault_get_request`, `vault_list_recent_requests`. See `examples/mcp.json`.
