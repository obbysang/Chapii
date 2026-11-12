# Architecture decisions

Each decision records the context, the choice, and the consequence. Decisions that deviate from `docs/SPEC.md` are called out explicitly.

## ADR-001 — Fastify instead of NestJS for the API

**Context.** The spec lists NestJS in the stack table. The API is a small, latency-sensitive REST + SSE service with zod-validated inputs.

**Decision.** Use Fastify 5 with `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, zod and pino.

**Why.** Fewer layers, native SSE via `reply.raw`, first-class schema/validation hooks, and a smaller container. NestJS would add decorators, DI wiring and a second validation idiom for no functional gain here.

**Consequence.** The route table is explicit in `apps/api/src/app.ts` rather than split across controllers. This is documented in `docs/api.md`.

## ADR-002 — A deterministic local simulator (`packages/localchain`)

**Context.** The brief requires a one-command Docker demo with zero API keys, while the spec requires a real NEAR contract. A judge should be able to run the stack offline.

**Decision.** Ship `packages/localchain`, an in-process emulator of the contract's decision order, balance accounting and cross-chain state machine. `NEAR_NETWORK=local` is the Docker default. Real NEAR remains the primary target.

**Why.** It makes the demo reproducible with no wallet, RPC, faucet or funded account, and it lets the harness run in CI.

**Consequence.** Two implementations of the same policy exist. They are kept aligned by the shared scenario suite, but only the Rust contract is the production enforcement point. The UI labels local mode as a simulator, and the README says so.

## ADR-003 — No owner key server-side

**Context.** An API that can sign owner transactions is a single point of compromise.

**Decision.** Owner actions are wallet transactions from the browser. The API verifies on-chain state and serves a read model. The executor key is a separate hot key with only `execute_crosschain` / `report_crosschain_result` permissions.

**Why.** It removes the most valuable secret from the server entirely and matches the product's trust story.

**Consequence.** The web app needs a wallet for owner flows. Read-only and demo flows work without one. The local simulator is the only place that generates an agent key server-side.

## ADR-004 — Local demo agent keys are generated server-side

**Context.** The guided local demo must work without the user installing a wallet or generating keys.

**Decision.** `POST /local/vaults/:id/agents` generates an ed25519 keypair, returns the private key once, and never stores it. This endpoint exists only in local mode.

**Why.** It makes the no-secrets demo possible.

**Consequence.** This is a deliberate exception to the "no keys server-side" rule. It is labelled in the UI, scoped to the simulator, and documented in the README and threat model. Production agents generate keys client-side.

## ADR-005 — Pin `near-api-js` differently in web and backend

**Context.** The web needs `near-api-js@^2.1.4` for compatibility with `@near-wallet-selector` 8.9.3. The SDK/API use the v7 API (`Account.callFunctionRaw`, `KeyPairString`, `teraToGas`).

**Decision.** Keep `near-api-js@^2.1.4` + wallet selector `8.9.3` in `apps/web`, and `near-api-js@^7.4.0` in `packages/sdk` and `apps/api`.

**Why.** The wallet selector's peer range is not compatible with v7; forcing one version breaks either the wallet or the SDK.

**Consequence.** Two copies of `near-api-js` exist in the workspace. This is intentional and isolated to the browser bundle.

## ADR-006 — `near-sdk = 5.30.1`

**Context.** The contract needs `#[near]`, `store::IterableMap`, `Promise::add_access_key`, and the current `PublicKey` / `U128` types.

**Decision.** Pin `near-sdk = 5.30.1` and split the contract into `types.rs`, `policy.rs`, `events.rs`, `lib.rs`, `tests.rs`.

**Why.** It is a stable 5.x release with the required APIs and a wasm target that builds with Rust 1.86.

**Consequence.** The contract is built in Docker (`Dockerfile.contract`) because Rust is not assumed on the host.

## ADR-007 — Prisma 6.19 with `db push` in the container

**Context.** The API needs a Postgres schema at startup and the demo should be one command.

**Decision.** Pin `@prisma/client` and `prisma` to `^6.19.0`. The API image runs `prisma db push --skip-generate` before starting.

**Why.** `db push` is appropriate for a single-service demo and avoids shipping a migration history that would need to match every fork.

**Consequence.** Long-lived deployments should switch to `prisma migrate deploy`. This is noted in `Dockerfile.api` and the README.

## ADR-008 — Prisma `Decimal(40,0)` and `toFixed(0)`

**Context.** `u128` amounts do not fit in a JS number. Prisma returns `Decimal`, whose `toString()` can use exponential notation for large values (`1e+24`), which breaks exact unit formatting.

**Decision.** Store amounts as `Decimal(40,0)` and serialise with `.toFixed(0)` everywhere.

**Why.** `toFixed(0)` always yields an integer string that `BigInt` can parse exactly.

**Consequence.** A regression here is visible as `1e+24 NEAR` in the UI. The fix is covered by the manual checklist and the read-model tests.

## ADR-009 — SSE for live updates

**Context.** The dashboard needs live receipts and harness progress.

**Decision.** Use Server-Sent Events (`text/event-stream`) with a per-vault subscriber hub, sequence numbers and heartbeats. Nginx disables buffering and sets a one-hour timeout for the path.

**Why.** One-way updates are exactly SSE's use case; it is simpler than WebSockets and survives proxies.

**Consequence.** The client reconnects with `EventSource`; the hub tolerates slow consumers by dropping the connection rather than buffering unboundedly.

## ADR-010 — Harness rate limiting and mainnet guard

**Context.** The UI exposes a "run the attack suite" button to anonymous users.

**Decision.** One concurrent run per vault, `HARNESS_PER_HOUR` runs per IP (default 3), and a hard refusal on mainnet. The config loader also refuses to start with `HARNESS_ENABLED=true` on mainnet.

**Why.** Prevent accidental cost/DoS and make it impossible to point the suite at production funds.

**Consequence.** A shared IP can exhaust its allowance; the UI shows a clear `429` message.

## ADR-011 — Harness scenario count is 34, not 26

**Context.** The spec's early drafts say "20+" and "26/26". The implementation grew to 27 attacks + 7 controls.

**Decision.** Treat `packages/harness/src/scenarios.ts` as the source of truth: 34 scenarios, 27 attacks, 7 controls. The UI and docs report those numbers.

**Why.** Claims must match what runs. A stale `dist` once reported 30/30 + 4/4; the build now includes all controls.

**Consequence.** README and submission copy use 27/27 and 7/7, not the spec's illustrative 26/26.

## ADR-012 — Nginx strips `/api`; Vite proxies it

**Context.** The browser needs one origin in Docker and a simple dev story.

**Decision.** `VITE_API_BASE=/api` in both modes. Nginx proxies `/api/` to `http://api:8787/` (prefix stripped). Vite proxies `/api` to `http://localhost:8787` in development.

**Why.** No CORS in the Docker deployment, and the same client code works in both environments.

**Consequence.** A separately hosted API needs an absolute `VITE_API_BASE` and CORS configuration.

## ADR-013 — MCP server supports `local-http` and `near`

**Context.** Agents should be able to use the vault with or without a real chain.

**Decision.** Infer the mode from `AGENTVAULT_API_URL` unless `AGENTVAULT_MODE` is set. `local-http` calls the simulator API; `near` uses the SDK against RPC. Tool outputs use snake_case to match the contract types.

**Why.** The same MCP config works for the demo and for production with one variable change.

**Consequence.** In `local-http` mode the MCP server needs an agent key issued by the simulator. In `near` mode it needs a registered on-chain agent key.

## ADR-014 — Cross-chain payout is honest about its limit

**Context.** The contract cannot verify that a 1-Click deposit address belongs to the payee.

**Decision.** Implement the full state machine (`AWAITING_EXECUTION` → `EXECUTING` → `COMPLETED`/`FAILED`), verify the reported destination against the allowlisted triple off-chain, flag mismatches, and document the gap. Do not claim on-chain destination verification.

**Why.** The alternative — hiding the gap — would be a false security claim.

**Consequence.** The README and threat model call this out. A TEE executor is the roadmap fix.

## ADR-015 — Local mode generates a fresh vault per `pnpm demo` run

**Context.** Reusing the seeded demo vault makes repeated demos interfere with each other.

**Decision.** `pnpm demo` creates a new simulator vault with its own agents and balances. The seeded `demo.agentvault.testnet` remains for the web demo.

**Why.** Deterministic, isolated runs that can be repeated without cleanup.

**Consequence.** The vault list grows during development; `docker compose down -v` resets it.
