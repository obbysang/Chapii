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

## Disclosure

- All AgentVault code in this repository was written for this submission.
- AI coding assistance was used.
- Third-party libraries: `near-sdk`, `near-api-js`, `@near-wallet-selector/*`, Fastify, Prisma, React, Vite, TanStack Query, zod, pino, lucide-react, vitest.
- No pre-existing AgentVault codebase or template was used.
