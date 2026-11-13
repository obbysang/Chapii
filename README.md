# AgentVault

**A policy-enforced treasury on NEAR for AI agents that spend money.**

An AI agent should be able to buy compute, pay an API bill, or settle a cross-chain invoice — without ever holding a key that can drain the account. AgentVault puts the money in a locked NEAR account and gives each agent a protocol-restricted function-call key that can only call `request_payment`. Every payment is checked on-chain against a per-agent policy: payee allowlist, per-transaction and daily caps, rate limits, co-sign thresholds, expiry, replay protection, and an auto-freeze circuit breaker.

```
                       owner (browser wallet)
                              │  add_agent / freeze / revoke / approve
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  AgentVault contract account (locked: no full-access key)         │
│                                                                  │
│  policy engine  ──►  allowlist · per-tx cap · daily cap · rate    │
│                     co-sign · expiry · replay · auto-freeze       │
│                                                                  │
│  same-chain: Transfer / ft_transfer                              │
│  cross-chain: AWAITING_EXECUTION ──► Intents executor (off-chain) │
└──────────────────────────────────────────────────────────────────┘
        ▲                                            │
        │ request_payment only                       │ receipts + events
        │ (function-call key)                        ▼
   agent / LLM / MCP client                 API indexer ──► Postgres
        │                                            │
        └──────────── SDK · MCP server ──────────────┴──► web dashboard
```

## Why this exists

- **Hot wallets are the weak point.** A prompt-injected agent with a full-access key can send everything to an attacker. A function-call key restricted to one method cannot.
- **"The model promised not to" is not a control.** Limits, allowlists and co-sign thresholds are enforced by the contract, not by the prompt.
- **Security claims need evidence.** The repo ships a deterministic 34-scenario red-team harness (27 attacks, 7 controls) that asserts the decision, the reason code, and the budget invariants after every call.

## Quick start — one Docker command

Requirements: Docker Desktop (Compose v2). No API key, wallet, or funded account is needed for the default local mode.

```bash
git clone <your-repo-url> agentvault
cd agentvault
cp .env.example .env        # optional: everything has a safe default
docker compose up --build
```

Open **http://localhost:8080**.

You should see:

- `/` — landing page with the architecture and threat model summary.
- `/demo` — guided demo: send a legitimate payment, then an attack, and watch the policy engine reject it.
- `/app` — owner console with balances, agents, receipts, approvals, funds, and the red-team suite.
- `/app/security` — click **Run 34 scenarios**; the run streams over SSE and ends with `27/27 attacks contained, 7/7 controls passed, 0 invariant violations`.
- `http://localhost:8787/health` — API health (`chain`, `db`, `indexerLagMs`).

Stop and delete the database volume with `docker compose down -v`.

> The default `NEAR_NETWORK=local` is a **deterministic simulator**. It emulates the contract policy and balance accounting in-process so the demo works offline with zero secrets. It is clearly labelled in the UI. Real NEAR is the primary target and is enabled with `NEAR_NETWORK=testnet` plus a deployed contract.

## Try it in 5 minutes (no Docker)

```bash
pnpm install

# Postgres on localhost:5432 (or point DATABASE_URL anywhere)
docker compose up -d db

cp .env.example .env
pnpm --filter @agentvault/api db:push

# Terminal 1 — API (local simulator, seeded demo vault)
pnpm dev

# Terminal 2 — web
pnpm --filter @agentvault/web dev
```

Then:

| Do this | See this |
|---|---|
| Open `http://localhost:5173` | Landing page, no wallet required. |
| Open `/demo` and send the legitimate payment | Green `COMPLETED` receipt, balance decreases. |
| Send the "pay attacker" request | Red `PAYEE_NOT_ALLOWED` receipt; no funds move. |
| Repeat the attack until the breaker trips | Agent status becomes `FROZEN` after 3 violations. |
| Open `/app/approvals` and approve the 4.5 NEAR request | Policy is re-checked at decision time, then the payment settles. |
| Run `pnpm harness` | 34/34 scenarios, 0 invariant violations, exit code 0. |
| Run `pnpm demo` | A fresh simulator vault, a good agent, a compromised agent, and a printed scoreboard. |

### Run the end-to-end demo

With the API running:

```bash
pnpm demo
```

It creates a fresh simulator vault, adds a well-behaved agent and a compromised agent, runs both scripts, prints the scoreboard, and tells you which dashboard URL to open. It never needs an LLM or a key.

### Run the red-team harness

```bash
# Deterministic, offline, no keys
pnpm harness

# JSON report
pnpm harness --json harness-report.json

# Real testnet contract (requires a throwaway funder account)
NEAR_ACCOUNT_ID=you.testnet \
NEAR_PRIVATE_KEY=ed25519:... \
VAULT_ACCOUNT_ID=demo.agentvault.testnet \
pnpm harness --network testnet
```

The CLI exits non-zero if any attack escapes, any control fails, or any budget invariant is violated.

### Use the MCP server

`packages/mcp-server` exposes five tools over stdio: `vault_get_budget`, `vault_get_policy`, `vault_request_payment`, `vault_get_request`, `vault_list_recent_requests`.

```json
{
  "mcpServers": {
    "agentvault": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
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

For a real vault, set `AGENTVAULT_MODE=near`, `NEAR_NETWORK=testnet`, and use the agent key that was registered on-chain. The server only ever holds the agent key — never the owner key.

## Environment

Every secret is provisioned through the environment. The full annotated list lives in [`.env.example`](.env.example), with per-app examples in `apps/*/.env.example` and `packages/*/.env.example`.

| Variable | Required? | Purpose |
|---|---|---|
| `NEAR_NETWORK` | no | `local` (default), `testnet`, `mainnet`. |
| `DATABASE_URL` | in Docker: automatic | Postgres connection string. |
| `NEAR_RPC_URL` | no | Override the public RPC endpoint. |
| `CORS_ORIGINS` | no | Comma-separated browser origins. |
| `SEED_DEMO`, `DEMO_VAULT_ID`, `DEMO_OWNER_ID`, `DEMO_FUNDING_NEAR` | no | Seed the local demo vault. |
| `HARNESS_ENABLED`, `HARNESS_PER_HOUR` | no | Enable and rate-limit the red-team runner. Forced off on mainnet. |
| `HARNESS_OWNER_ACCOUNT_ID`, `HARNESS_OWNER_PRIVATE_KEY` | testnet harness only | Throwaway funder for ephemeral harness agents. |
| `EXECUTOR_ACCOUNT_ID`, `EXECUTOR_PRIVATE_KEY` | cross-chain only | Hot key that may only report settlement; cannot create or approve requests. |
| `ONECLICK_API_URL`, `ONECLICK_JWT` | no | NEAR Intents 1-Click endpoint and optional JWT. |
| `VITE_API_BASE` | no | Browser API base (`/api` in Docker). |
| `VAULT_ACCOUNT_ID`, `AGENT_PRIVATE_KEY` | agent runtime | Agent identity for the MCP server / demo agents. |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | optional | Only for `pnpm agent:llm`; everything deterministic works without it. |

No owner private key is ever stored or accepted by the API. Owner actions are signed in the browser wallet. The one exception is the local simulator, which generates a demo agent key server-side and returns it once; this is a demo-only convenience and is labelled in the UI.

## Repository map

```
contracts/
  vault/                 Rust NEAR contract: policy engine, requests, events, views
  mock-ft/               minimal NEP-141 token for local/testnet demos
packages/
  shared/                types, zod schemas, reason codes, exact unit formatting
  sdk/                   AgentVaultClient (agent key) + OwnerClient (owner key)
  localchain/            deterministic offline emulator used by local mode + harness
  harness/               34 red-team scenarios, local + real-chain backends
  mcp-server/            stdio MCP server (5 tools)
  demo-agent/            scripted good/attack agents + optional LLM injection demo
apps/
  api/                   Fastify + Prisma + Postgres, indexer, SSE, executor, harness
  web/                   React + Vite dashboard, wallet selector, owner console
scripts/                 contract build, testnet/mainnet deploy, vault lock
docs/                    architecture, threat model, API, MCP, SDK, limitations, decisions
```

## Tests and checks

```bash
pnpm build          # every package and app
pnpm typecheck      # strict TypeScript, no emit
pnpm lint           # per-workspace type check
pnpm test           # unit tests
pnpm harness        # 34-scenario red-team suite
```

The contract is built and tested with Rust (needs rustc ≥ 1.95, the MSRV of
near-sdk 5.30; the Docker path pins the toolchain for you):

```bash
pnpm contract:build   # dockerized wasm build + cargo test, exports build/contracts
pnpm contract:test    # cargo test if Rust is installed locally
```

## Real NEAR mode

1. Build the contract: `pnpm contract:build` → `build/contracts/vault.wasm`.
2. Deploy a vault and add an agent with the SDK's `OwnerClient` (or `scripts/deploy-testnet.ts`).
3. Set `NEAR_NETWORK=testnet`, `NEAR_RPC_URL`, and register the vault:

```bash
curl -X POST http://localhost:8787/vaults \
  -H 'content-type: application/json' \
  -d '{"vaultId":"demo.agentvault.testnet","label":"Demo vault"}'
```

The API verifies `get_owner()` and `get_agents()` on-chain before indexing. The web app then shows the real vault; owner actions are signed by the connected wallet, and the API never sees the owner key.

**Mainnet:** set `NEAR_NETWORK=mainnet`. The API refuses to start if `HARNESS_ENABLED=true`. Keep balances minimal and treat the cross-chain executor as a hot key with a minimal float.

## Honest limitations

- **Cross-chain destinations are verified off-chain.** The contract enforces the allowlisted `(chain, address, dest_asset)` triple and records the executor's settlement report, but it cannot independently prove that a NEAR Intents deposit address belongs to the payee. The dashboard compares the reported destination against the policy and flags mismatches. A TEE/attested executor is the roadmap fix. This is documented in [docs/threat-model.md](docs/threat-model.md).
- **Fixed time buckets allow a boundary burst.** Daily/hourly windows are `block_timestamp / window`, so an agent can spend a full daily budget just before a boundary and again just after. Caps remain bounded; the rate limiter and co-sign threshold still apply. Documented, not hidden.
- **The local simulator is not the contract.** It mirrors the policy engine and is tested against the same scenario suite, but only the Rust contract is the production enforcement point. Real-chain mode is the primary path.
- **Intents is mainnet-only.** The funding/payout integration is real but requires mainnet and tiny amounts; the demo does not fake a cross-chain settlement.
- **No independent audit.** The contract is unit-tested and exercised by the harness, but has not been audited. Do not custody life-changing sums.

## Security model at a glance

| Threat | Control | Enforced by |
|---|---|---|
| Prompt-injected agent pays attacker | payee allowlist + normalisation | contract |
| Salami slicing / drain | per-tx cap, daily cap, rate limit, auto-freeze | contract |
| Agent calls owner methods or another contract | function-call key restricted to `request_payment` | NEAR protocol |
| Replay / duplicate payment | per-agent `client_ref` idempotency | contract |
| Overflow / extreme amounts | checked `u128` arithmetic, zod validation | contract + API |
| Stolen agent key | freeze / revoke, DeleteKey on revoke | contract |
| Stale approval overspends | approval re-validates policy and budget | contract |
| Malicious API/operator | no owner key server-side; owner actions signed in wallet | architecture |

See [docs/threat-model.md](docs/threat-model.md) for the full table, including residual risks.

## Documentation

- [docs/architecture.md](docs/architecture.md) — components, data flows, trust boundaries.
- [docs/threat-model.md](docs/threat-model.md) — threats, mitigations, residual risk.
- [docs/api.md](docs/api.md) — REST and SSE reference.
- [docs/mcp.md](docs/mcp.md) — MCP server tools, modes, client wiring.
- [docs/sdk.md](docs/sdk.md) — TypeScript SDK usage, amounts, assets.
- [docs/limitations.md](docs/limitations.md) — the known gaps, stated plainly.
- [docs/DECISIONS.md](docs/DECISIONS.md) — architecture decisions and trade-offs.
- [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md) — what a judge should verify.
- [HACKATHON_NOTES.md](HACKATHON_NOTES.md) — demo script, submission checklist, disclosure.

## Disclosure

Built for the NEAR AI Hackathon (Nov 2026). The contract, SDK, MCP server, harness, API and web app in this repository were written for this submission. Third-party libraries are listed in each `package.json` / `Cargo.toml`; the main ones are `near-sdk`, `near-api-js`, Fastify, Prisma, React, Vite, TanStack Query, zod, and the NEAR Wallet Selector. AI coding assistance was used. No pre-existing AgentVault codebase was used.

## License

MIT — see [LICENSE](LICENSE).
