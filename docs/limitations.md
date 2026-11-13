# Limitations

AgentVault is deliberately explicit about what it does **not** guarantee. Every
item below is a known gap with a named enforcement boundary, not a footnote.

## Cross-chain destinations are verified off-chain

The contract enforces the allowlisted `(chain, address, dest_asset)` triple and
stores the executor's settlement report. It cannot independently prove that a
NEAR Intents deposit address belongs to the payee. The dashboard compares the
reported destination against the policy and flags a mismatch, but that check is
off-chain.

**Roadmap:** an attested executor (TEE) that proves the deposit address
derivation. Until then, treat cross-chain payouts as "policy-checked, not
destination-verified". See [threat-model.md](threat-model.md).

## Fixed time buckets allow a boundary burst

Daily and hourly windows are `block_timestamp / window`. An agent can spend a
full daily budget immediately before a boundary and again immediately after.
Caps remain bounded, and the rate limiter and co-sign threshold still apply, but
the boundary itself is not smoothed.

**Roadmap:** a sliding window or a token-bucket accumulator in contract storage.

## The local simulator is not the contract

`packages/localchain` mirrors the Rust policy engine and is tested against the
same scenario suite, but it is TypeScript running in the API process. Only the
Rust contract is the production enforcement point. Real-chain mode
(`NEAR_NETWORK=testnet|mainnet`) is the primary path; the simulator exists so the
one-command demo needs no keys and no network.

## Intents is mainnet-only

The cross-chain funding and payout integration is real but requires mainnet and
small amounts. The demo never fakes a cross-chain settlement; it stays in
simulator mode or shows an `AWAITING_EXECUTION` request that a configured
executor would pick up.

## No independent audit

The contract is unit-tested and exercised by the 34-scenario harness, but it has
not been audited by a third party. Do not custody life-changing sums.

## No owner-key custody

This is a design property, not a gap: the API and web app never hold the owner's
private key. Owner actions are signed in the browser wallet. The local simulator
generates a demo agent key server-side, which is a documented demo-only
exception and never happens in real-chain mode.
