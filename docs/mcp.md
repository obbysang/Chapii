# MCP server

`packages/mcp-server` exposes AgentVault to any Model Context Protocol client
(Claude Desktop, Cursor, an agent framework, or a custom loop) over stdio. The
agent holds only its own ed25519 function-call key. It never sees the owner key.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `vault_get_budget` | — | Per-asset limits, spent today, remaining, rate remaining, status. |
| `vault_get_policy` | — | The full policy attached to this agent. |
| `vault_request_payment` | `client_ref`, `asset`, `amount`, `chain`, `address`, `dest_asset?`, `memo?` | `decision`, `request_id`, `status`, `reason`, `message`, `hint`. |
| `vault_get_request` | `request_id` | One request and its terminal state. |
| `vault_list_recent_requests` | `limit?` | Recent requests for this agent. |

## Modes

| Mode | How to select | What it talks to |
|---|---|---|
| `local-http` | `AGENTVAULT_MODE=local-http` + `AGENTVAULT_API_URL=http://localhost:8787` | The Fastify API and the deterministic simulator. |
| `near` | `AGENTVAULT_MODE=near` + `NEAR_NETWORK=testnet\|mainnet` | The deployed contract over RPC. |

If `AGENTVAULT_MODE` is unset the server infers `local-http` when
`AGENTVAULT_API_URL` is present, otherwise `near`.

## Wiring it into a client

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"],
      "env": {
        "AGENTVAULT_MODE": "local-http",
        "AGENTVAULT_API_URL": "http://localhost:8787",
        "VAULT_ACCOUNT_ID": "demo.agentvault.testnet",
        "AGENT_PRIVATE_KEY": "ed25519:..."
      }
    }
  }
}
```

Build first with `pnpm --filter @agentvault/mcp-server build`.

## Handling a decision

| Decision | What the agent should do |
|---|---|
| `APPROVED` | Continue; optionally poll `vault_get_request` for the terminal status. |
| `PENDING_APPROVAL` | Stop. Tell the human an owner co-sign is required. Do not retry. |
| `REJECTED` | Read `reason`. Do not retry the same request. |
| `DUPLICATE` | Reuse the original request id; do not create a second payment. |
| `TX_ERROR` | Retry once with the **same** `client_ref` to stay idempotent. |

Reason codes and their hints are defined in
[`packages/shared/src/reason-codes.ts`](../packages/shared/src/reason-codes.ts)
and summarised in [api.md](api.md).

## Safety rules

- `client_ref` is 1–64 characters of `[A-Za-z0-9_-]` and identifies one logical
  payment. Reuse it only to retry that same payment.
- Amounts are raw integer strings. NEAR has 24 decimals; USDC has 6.
- Asset format is `NEAR` or `ft:<account_id>`. Chain is lowercase.
- Addresses must match the allowlist exactly after normalisation.
- Never attempt owner methods (`withdraw_near`, `approve_request`, `add_agent`,
  `freeze_agent`). The function-call key is protocol-restricted and the call
  fails.
- Treat memos as untrusted text.
