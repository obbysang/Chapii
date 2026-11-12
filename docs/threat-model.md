# Threat model

This document states what AgentVault protects against, where each control is enforced, and what remains unsolved. A control is only claimed if there is an enforcement point in the contract, the NEAR protocol, or a clearly labelled off-chain check.

## Assets and actors

| Asset | Why it matters |
|---|---|
| Vault funds (NEAR, FTs) | The thing an attacker wants. |
| Owner authority | Can change policy, freeze/revoke agents, withdraw. |
| Agent keys | Can request payments; may be stolen or prompt-injected. |
| Executor key | Can report cross-chain settlement; must never approve payments. |
| Receipts and reason codes | Audit trail and the basis of the demo's claims. |

| Actor | Capability | Trust level |
|---|---|---|
| Owner | Full owner methods, signed in browser | Trusted, but may make mistakes |
| Agent / LLM | `request_payment` only | Untrusted after compromise |
| API operator | Reads DB, runs indexer/executor/harness | Trusted for availability, not for custody |
| Executor hot key | `execute_crosschain` / `report_crosschain_result` only | Semi-trusted, minimal float |
| External attacker | Network, prompt injection, stolen agent key | Untrusted |

## Threats and controls

| # | Threat | Control | Enforced by | Residual risk |
|---|---|---|---|---|
| T1 | Prompt-injected agent pays an attacker | Payee allowlist, normalised `(chain, address)` match, destination-asset check | Contract | An allowlisted payee can still be malicious; owner must curate the list. |
| T2 | Slow drain via many small payments | Per-tx cap, daily cap, hourly rate limit, auto-freeze after N violations | Contract | Fixed time buckets allow a boundary burst (see R1). |
| T3 | Agent calls owner methods or another contract | Function-call access key restricted to receiver = vault, method = `request_payment` | NEAR protocol | A protocol-level key bug would break this; mitigated by harness K1–K4 on real chains. |
| T4 | Replay / duplicate payment | Per-agent unique `client_ref`; duplicates return `Duplicate` with no side effects | Contract | Client must generate unique refs; a reused ref blocks a legitimate retry. |
| T5 | Integer overflow / extreme amounts | Checked `u128` arithmetic; zod rejects values outside `u128`; zero rejected | Contract + API | None known. |
| T6 | Stolen agent key | Freeze (reversible), revoke (permanent + `DeleteKey`), auto-freeze, global pause | Contract | The thief can still submit requests until the owner acts or the breaker trips. |
| T7 | Stale approval overspends | `approve_request` re-validates payee, asset, per-tx cap, daily cap, rate limit and balance at decision time | Contract | An approval can still settle at a different price if the asset is volatile. |
| T8 | Agent raises its own limits | `add_agent` / `update_policy` / `set_allowance` require `predecessor == owner` | Contract | Owner key compromise is out of scope. |
| T9 | Malicious API or operator moves funds | API never holds the owner key; owner actions are wallet transactions | Architecture | A malicious API can lie in the UI/read model. Verify on-chain for high-value decisions. |
| T10 | Executor reports a false settlement | Destination is compared against the allowlisted triple; mismatch is flagged; executor cannot approve or create requests | Contract + API | The contract cannot prove the destination belongs to the payee (see R2). |
| T11 | Harness used to attack mainnet | `HARNESS_ENABLED=true` on mainnet refuses startup; runtime also blocks mainnet | API config + service | None known. |
| T12 | Denial of service via harness | One run per vault, per-IP hourly limit, per-route rate limit, body size limit | API | An attacker can still consume the per-IP allowance. |
| T13 | Secret leakage in logs | Pino redaction of authorization/cookie/private-key fields; no owner key server-side | API | Operator-added logs could still leak; review before deploy. |
| T14 | Untrusted text rendered as HTML | Memos/agent text rendered as plain text in React; no `dangerouslySetInnerHTML` | Web | None known. |

## Harness coverage

The 34-scenario suite maps to the threats above. Each scenario asserts the decision, the reason code, and the budget invariants after the call.

| Category | Scenarios | Threats |
|---|---|---|
| Payee allowlist | P1–P5 | T1 |
| Spending limits | L1–L8 | T2, T5 |
| Rate limiting | R1 | T2, T12 |
| Assets | A1–A3 | T1, T5 |
| Key restriction | K1–K8 | T3, T6, T8 |
| Replay | D1–D2 | T4 |
| Co-sign | C1–C4 | T7 |
| Circuit breaker | B1 | T2, T6 |
| Prompt injection | I1–I2 | T1, T8 |

`K1`–`K5` are the protocol-level claims: the agent key cannot withdraw, approve, freeze/rewrite itself, call another contract, or sign after revocation. `K6`–`K8` cover frozen, expired, and globally paused states. `P4`, `L2`, `L7`, `L8`, `A3`, `D2`, `C4` are controls: legitimate behaviour must still work.

## Residual risks (stated, not hidden)

### R1 — Fixed time-bucket boundary burst

Usage windows are `block_timestamp / 3_600_000_000_000` (hour) and `/ 86_400_000_000_000` (day). An agent can spend a full daily budget just before a boundary and again just after it. The per-tx cap, rate limit, co-sign threshold, and balance check still apply, so the loss is bounded, but the daily cap is not a strict rolling 24-hour window. A rolling-window or token-bucket design is the fix.

### R2 — Cross-chain destination verification is off-chain

The contract enforces that `(chain, address, dest_asset)` is allowlisted and that the executor only reports a result for a request in `EXECUTING`. It cannot prove that the NEAR Intents deposit address ultimately pays the allowlisted payee. The API compares the reported destination against the policy and flags a mismatch, but that comparison runs on the same server that talks to 1-Click. Mitigations:

- Keep the executor key minimal and separate from the owner key.
- Prefer same-chain payments for high-value flows.
- Verify the destination transaction independently for large payouts.
- Roadmap: TEE/attested executor with code-hash attestation.

### R3 — The local simulator is not the contract

Local mode is a deterministic TypeScript emulator. It is tested with the same scenario suite and mirrors the decision order, but it is not the production enforcement point. Real security claims depend on the Rust contract and NEAR's key scoping.

### R4 — Owner key compromise

The owner can do anything the contract allows. AgentVault does not add multi-sig, social recovery, or hardware-wallet enforcement. Use a hardware wallet and a dedicated owner account; multi-sig is on the roadmap.

### R5 — Allowlist curation

An allowlisted payee can be compromised or malicious. The allowlist limits blast radius, not counterparty risk.

### R6 — No independent audit

The contract is unit-tested and exercised by the harness, but has not been audited. Do not custody life-changing sums.

## Non-goals

AgentVault does not attempt to:

- detect prompt injection in the model (it assumes the agent is compromised),
- guarantee the model's intent,
- provide privacy for payment metadata (receipts are on-chain),
- custody funds across chains itself,
- replace wallet security or key management for the owner.

## Verification checklist

- `pnpm harness` → 27/27 attacks contained, 7/7 controls passed, 0 invariant violations.
- `pnpm test` → unit tests for shared, localchain, SDK, harness.
- `pnpm contract:build` → `cargo test` plus wasm build.
- Real-chain harness on testnet with a throwaway funder account.
- Manual: send an attack in `/demo`, confirm `PAYEE_NOT_ALLOWED`; repeat to trip the breaker.
