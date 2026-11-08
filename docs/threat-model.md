# AgentVault — Threat Model

| # | Threat | Mitigation | Enforced where |
|---|--------|-----------|----------------|
| T1 | Agent prompt-injected to pay attacker | Payee allowlist (exact normalised chain+address match) | Contract |
| T2 | Agent drains via many small payments | Daily cap + rate limit + auto-freeze circuit breaker | Contract |
| T3 | Agent calls owner methods or other contracts | Function-call key restricted to `request_payment` on the vault receiver | NEAR protocol |
| T4 | Replay / duplicate payment | Per-agent unique `client_ref` idempotency (`DUPLICATE`) | Contract |
| T5 | Integer overflow / extreme amounts | Checked arithmetic, input validation | Contract |
| T6 | Stolen agent key | Freeze/revoke in one owner tx; key holds a gas allowance only, no funds | Contract + protocol |
| T7 | Lookalike payee address | Exact match (chain + normalised address; EVM case-insensitive, no fuzz) | Contract |
| T8 | Malicious/buggy executor redirects cross-chain payout | **Residual risk** (see below) | Contract + dashboard |
| T9 | Owner key compromise | Out of scope; documented | — |
| T10 | Backend compromise | Backend holds no owner keys; executor key is funded minimally; chain state unaffected | Architecture |

## Known limitation (cross-chain executor, spec §4.9 — honest)

For cross-chain payouts the contract **cannot verify on-chain** that the 1-Click deposit address supplied by the executor corresponds to the payee. The payout destination is therefore verified **off-chain**:

- The executor can only fund an already-approved request, once, for the exact `amount` (`AwaitingExecution`, 15-minute window, cross-chain FT only).
- The dashboard independently queries the 1-Click status API and flags any request whose destination address ≠ payee as **MISMATCH** with a one-click pause.
- Same-chain NEAR/FT payouts have **no such gap**: the transfer happens in a contract promise and the request only completes after the callback succeeds (usage is reverted on failure).

Roadmap: run the executor as a Shade Agent in a TEE and verify code-hash attestation.

## Other notes
- Owner keys never touch the server; the backend only ever holds the executor hot key from env.
- Agent-supplied memo text is untrusted and rendered as plain text in the UI.
- The API holds no state-changing endpoints that move funds except the executor's narrowly-scoped flow.
