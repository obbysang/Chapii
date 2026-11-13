# Hackathon notes

Working notes for the NEAR AI Hackathon submission. The judge-facing entry point is the [README](README.md).

## One-liner

AgentVault is a policy-enforced treasury on NEAR: a locked vault account gives each AI agent a protocol-restricted function-call key that can only request payments, and every request is checked on-chain against an allowlist, caps, rate limits, co-sign thresholds and an auto-freeze breaker.

## What is actually implemented

| Area | Status | Evidence |
|---|---|---|
| Rust vault contract | Implemented | `contracts/vault`, unit tests in `tests.rs` |
| Mock NEP-141 token | Implemented | `contracts/mock-ft` |
| Function-call key restriction | Implemented + tested | `K1`–`K5` in the harness |
| Policy engine (allowlist, caps, rate, co-sign, expiry, replay, freeze) | Implemented | `contracts/vault/src/policy.rs` |
| SDK | Implemented | `packages/sdk` |
| MCP server (5 tools) | Implemented | `packages/mcp-server` |
| Red-team harness | Implemented | 34 scenarios, 27 attacks + 7 controls |
| REST API + SSE | Implemented | `apps/api` |
| Web dashboard | Implemented | `apps/web` |
| Cross-chain payout state machine | Implemented with honest limitation | `apps/api/src/services/executor.ts` |
| Cross-chain funding quote | Implemented | `apps/api/src/services/intents.ts` |
| One-command Docker stack | Implemented | `docker compose up --build` |
| CI | Implemented | `.github/workflows/ci.yml` |
| Local simulator | Implemented (demo/CI) | `packages/localchain` |

## Demo script (≈3 minutes)

### Guided demo at `/demo` — what the judge will see

The tour is deterministic. Click **Reset counter** first (the seed leaves one
recorded violation), then run the scenarios in order:

| # | Scenario | Decision | Reason code |
|---|---|---|---|
| 1 | Legitimate purchase | `COMPLETED` | — (the control: it must go through) |
| 2 | Prompt-injection drain | `REJECTED` | `PAYEE_NOT_ALLOWED` |
| 3 | Above the co-sign threshold | `PENDING_APPROVAL` | — (the owner must sign) |
| 4 | Lookalike vendor | `REJECTED` | `PAYEE_NOT_ALLOWED` (exact address match) |
| 5 | Oversized payout | `REJECTED` | `PER_TX_CAP_EXCEEDED` — the third violation trips the auto-freeze |
| 6 | Unlisted asset | `REJECTED` | `AGENT_FROZEN` (the breaker is holding) |
| 7 | Cross-chain payout | `APPROVED` → simulated settlement | `sim-local-…` deposit address, never real funds |

### Spoken script

1. **Landing page (0:00–0:20).** State the problem: agents with hot wallets can be drained. Show the diagram and the claim that the key can only call one method.
2. **Console (0:20–0:50).** Open `/app`. Point out balances, the three agents, the pending co-sign, and the "local simulator" badge. Explain that the same UI runs against real NEAR.
3. **Good payment (0:50–1:15).** Open `/demo`, send the legitimate payment. Show the green `COMPLETED` receipt and the balance change.
4. **Attack (1:15–1:50).** Send the "pay attacker" request. Show the red `PAYEE_NOT_ALLOWED` receipt. Send it again to show the violation counter, then once more to trip the auto-freeze. Point out that no funds moved.
5. **Owner response (1:50–2:10).** Open `/app/approvals`; approve the 4.5 NEAR request and show that approval re-checks policy. Freeze/revoke the compromised agent.
6. **Evidence (2:10–2:40).** Open `/app/security`, click **Run 34 scenarios**, let the stream finish, and show `27/27 attacks contained, 7/7 controls passed, 0 invariant violations`.
7. **Close (2:40–3:00).** Show the README quick start and the one-command Docker line. Mention the MCP server and the honest cross-chain limitation.

## X post draft

> AI agents with hot wallets are one prompt injection away from draining an account.
>
> AgentVault is a policy-enforced treasury on @NEARProtocol: a locked vault gives each agent a function-call key that can only call `request_payment`, and every request is checked on-chain against an allowlist, caps, rate limits and co-sign thresholds. A 34-scenario red-team harness proves it — 27/27 attacks contained.
>
> Built at #NEARHackathon. Repo + demo: <links>
>
> What would you add to the policy engine?

Must tag `@NEARProtocol` and `#NEARHackathon`. The human posts it.

## Claims checklist

Use these exact numbers; they match `packages/harness/src/scenarios.ts`:

- 34 scenarios total.
- 27 attacks.
- 7 controls.
- `27/27 attacks contained, 7/7 controls passed, 0 invariant violations`.

Do not reuse the spec's illustrative "26/26" or an older "30/30 + 4/4".

## Honest limitation (say this out loud)

Cross-chain destinations are verified **off-chain**. The contract enforces the allowlisted `(chain, address, dest_asset)` triple and records the executor's report, but it cannot prove the Intents deposit address pays the payee. The dashboard flags mismatches. A TEE/attested executor is the roadmap fix. Do not claim on-chain destination verification.

Also disclose:

- Fixed time buckets allow a bounded boundary burst.
- The local simulator is not the contract.
- The contract has not been independently audited.
- Local mode generates a demo agent key server-side as a labelled convenience.

## Submission checklist

- [ ] Repo is public and stays public through judging.
- [ ] `LICENSE` present (MIT).
- [ ] README quick start works from a clean clone.
- [ ] `docker compose up --build` works on a clean machine.
- [ ] `/`, `/demo`, `/app`, `/app/security` load with no console errors.
- [ ] `pnpm harness` exits 0 with 34/34.
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` pass.
- [ ] Contract build/test (`pnpm contract:build`) passes.
- [ ] MCP server works from a standard MCP client.
- [ ] Video recorded (screenshots alone are not enough).
- [ ] X post published with `@NEARProtocol` and `#NEARHackathon`.
- [ ] Form submitted once with a human-confirmed payload.
- [ ] Hosted demo stays up through judging.

## Env provisioning for the hosted demo

The Docker stack needs **no secrets**. For a real testnet deployment:

```bash
NEAR_NETWORK=testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
HARNESS_ENABLED=true
HARNESS_OWNER_ACCOUNT_ID=<throwaway-funder.testnet>
HARNESS_OWNER_PRIVATE_KEY=ed25519:...
```

For cross-chain payouts/funding (mainnet only):

```bash
NEAR_NETWORK=mainnet
HARNESS_ENABLED=false
EXECUTOR_ACCOUNT_ID=<executor.near>
EXECUTOR_PRIVATE_KEY=ed25519:...
ONECLICK_API_URL=https://1click.chaindefuser.com
ONECLICK_JWT=            # optional
```

The owner key is never configured server-side; it lives in the browser wallet.

## Verified on this machine

Reproduce with the commands in the README; these are the observed results.

| Gate | Command | Result |
|---|---|---|
| Build | `pnpm build` | Pass |
| Types | `pnpm typecheck` | Pass (9 workspaces) |
| Unit + route tests | `pnpm test` | Pass — shared 8, localchain 5, sdk 3, mcp-server 1, api 15, web 15 |
| Red-team harness | `pnpm harness` | 27/27 attacks contained, 7/7 controls passed, 0 invariant violations |
| Stack | `docker compose up -d` | db + api + web healthy on :8080 / :8787 |
| Live updates | send a payment in `/app/requests` | row appears in ~1 s over SSE |
| Docs | `/docs/` and every footer link | 200, `text/plain` for `.md` |
| Responsive | 13 routes at 390 / 768 / 1440 px | 0 px horizontal overflow on every route |
| Lighthouse | `/`, `/app`, `/app/requests`, `/demo`, `/app/security`, `/app/agents`, `/app/approvals`, `/app/fund`, `/app/settings`, `/app/vaults/new` | Accessibility 1.0, Best practices 1.0, SEO 1.0, 0 console errors |

Contract compilation and Rust tests run in CI and the `Dockerfile.contract`
image; they are not runnable on a machine without a Rust toolchain.

## Provisioning keys for the hosted demo

The default stack needs **no secrets**. Copy `.env.example` to `.env` and fill
only the block for the feature you use:

| Block | Variables | Needed for |
|---|---|---|
| Core | `POSTGRES_*`, `API_PORT`, `WEB_PORT`, `NEAR_NETWORK` | Everything (safe defaults). |
| Testnet deploy | `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `VAULT_ACCOUNT_ID` | `pnpm deploy:testnet`, testnet harness. |
| Harness funder | `HARNESS_OWNER_ACCOUNT_ID`, `HARNESS_OWNER_PRIVATE_KEY` | The API-hosted "Run 34 scenarios" button on testnet. |
| Cross-chain | `EXECUTOR_ACCOUNT_ID`, `EXECUTOR_PRIVATE_KEY`, `ONECLICK_API_URL`, `ONECLICK_JWT` | Real NEAR Intents payouts (mainnet only). |
| LLM agent | `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | `pnpm agent:llm` only; the demo is deterministic and never calls an LLM. |

Never commit `.env`. The owner key is not an environment variable at all: it is
signed in the browser wallet.

## Disclosure

- All AgentVault code in this repository was written for this submission.
- AI coding assistance was used.
- Third-party libraries: `near-sdk`, `near-api-js`, `@near-wallet-selector/*`, Fastify, Prisma, React, Vite, TanStack Query, zod, pino, lucide-react, vitest.
- No pre-existing AgentVault codebase or template was used.
