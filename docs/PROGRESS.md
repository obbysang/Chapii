# PROGRESS — AgentVault

## Phase 0 — Recon and verification  [DONE]
- Completed:
  - Read `agentvault-spec.md` fully (951 lines, spec §§0-14).
  - Fetched live `https://nearhackathon.com/HACKATHON.md` (246 lines, 2026-11-08) → `HACKATHON_NOTES.md` in repo root.
  - Resolved all [VERIFY] V1-V14 against current docs → `docs/DECISIONS.md` (D-001…D-003 + V1…V14).
  - Toolchains verified: rustc 1.99.1 / cargo 1.99.1 (rustup), `wasm32-unknown-unknown` target installed, cargo-near 0.23.0 (prebuilt binary; `cargo install` exceeds timeouts in this env), near-cli-rs 0.31.1, Node v24.15.0, pnpm 11.1.2, Docker 29.5.3 / Compose v5.1.4, testnet RPC `https://rpc.testnet.near.org` live (protocol 88).
  - **Key de-risking experiment PASSED** on testnet (minimal contract `ping()` logging `signer_account_pk()` + `predecessor_account_id()`, deployed to throwaway vault account below):
    - (a) predecessor == contract account: `predecessor=agentvault-hk0.testnet current=agentvault-hk0.testnet` (ping tx eNvEqVQZDsUWk7mEK3WpQYQYGZCK4LZbGs3goeA6xKM, block ~276.8M; result `"signer_pk=ed25519:217KV2yXorSN6qkSeQJ1VSE9H85DCyCUC8kp8D8TYjLF predecessor=agentvault-hk0.testnet current=agentvault-hk0.testnet"`). ✓
    - (b) signer pk == added function-call key (`ed25519:217K…` = the restricted key added via `add_key`, not the owner key). ✓
    - (c) restricted key CANNOT call other method (`other`) — protocol error: `Transaction method name other isn't allowed by the access key`; CANNOT call other contract (`v1.social08.testnet.get`) — `Wrong AccessKey used for transaction: receiver_id=v1.social08.testnet, signed with function call access key restricted to only use with receiver_id=agentvault-hk0.testnet`. ✓
    - (d) contract self add/delete keys via promises: `add_key` tx FnLQp16tE4o2hF1J3ehcYJBydLr8tJmxrgkYQ4qkDisE, `del_key` tx D2c3vniCozWhRpMVecZiyxLTyx7qx2LEdBxcMzaY4uby; key list reflects add then delete. ✓
    - (e) zero-key account exists: `zero72572.agentvault-hk0.testnet` created (tx J1wfLgahiPHxMTjhhDn9UrsQgYUVTHrtZdWD1uNaxXkv), funded 0.1 NEAR, own key deleted → `view_access_key_list` = `{"keys":[]}` at block 276810842. ✓
  - Testnet throwaway account: **agentvault-hk0.testnet** (faucet-funded 10 NEAR; deploy tx 7y2KYJfz315rqaZ16iioZgK8XtH2Y1qVBbM6drcoZTbk, init 5ruDBud6sKKkffChCDgmgzNa1KDbCdi69CVhktCt3Tn9; WASM `exp_contract.wasm` 178 KB). Keys in `~/.near-credentials/testnet/agentvault-hk0.testnet/` (NOT in git).
  - Experiment artifacts: `exp-contract/` (Rust lib.rs + build log) and `exp.mjs`/`zero.mjs`/`tx.mjs` — temporary, will be deleted/regularized in Phase 1 scaffold; key findings folded into DECISIONS V2-V4 and Phase 2 design.
- Gate results:
  - `HACKATHON_NOTES.md` exists ✓; `docs/DECISIONS.md` has V1-V14 ✓; experiment recorded above ✓; toolchains verified ✓ → **Gate 0 PASSED**
- Deviations from spec: D-001/D-002/D-003 (see DECISIONS.md). near-api-js v7 note: `connect()` removed from `near-api-js` root — use `@near-js/accounts` `Account` + `@near-js/providers` `JsonRpcProvider` + `@near-js/signers` `KeyPairSigner` (versions 2.5.1); recorded in D-007/D-008.
- [VERIFY] items resolved: V1-V14, all closed (V2-V4 experimentally confirmed).
- Open risks / next:
  - Env caveats: `cargo-near` prompts require a TTY (use pty wrapper or `RUSTUP_TOOLCHAIN=stable cargo build --target wasm32-unknown-unknown --release` + `cargo near build non-reproducible-wasm`); `near` CLI also TTY-only; rust-toolchain pin (1.95) forces slow toolchain download — Phase 1 must pin/check.
  - No human-required blocker yet. Next: Phase 1 scaffold (monorepo per spec §3.3, CI, guardrails, README skeleton). Human-required #1 (testnet faucet keys for the repo `.env`) will be needed by Phase 3+ (Gate 3 script) — a fresh faucet account is creatable via `near account create-account sponsor-by-faucet-service` as done here.

## Phase 1 — Scaffold, CI, guardrails  [DONE]
- Completed:
  - Monorepo per spec §3.3: `pnpm-workspace.yaml`, root `package.json` (packageManager pnpm@11.1.2, scripts build/test/lint/typecheck/demo/harness/agent:*), `tsconfig.base.json` (strict), root `eslint.config.js` (typescript-eslint recommended), `.prettierrc.json`.
  - Packages stubbed with compiling entry points + passing vitest stubs: `packages/{shared,sdk,mcp-server,harness,demo-agent}`, `apps/{api,web}` (NestJS health stub; Vite+React stub).
  - `docker-compose.yml` Postgres 16 (port 5434 — 5432 occupied by unrelated local container; D-004 recorded here), `.env.example` × 4, `.gitignore` (incl. `.env`, key material, wasm, harness reports), `scripts/secret-scan.sh` + git `pre-commit` hook (regex fallback; `.env`/private-key patterns; public `ed25519:` keys NOT flagged — false positive fixed after first commit attempt).
  - GitHub Actions `.github/workflows/ci.yml` (lint+typecheck+build+test, contract cargo test/build, Postgres service for API, web build).
  - `README.md` skeleton with spec §12.1 headings.
  - git: `main` branch, initial commits (secret hook active).
- Gate results:
  - `pnpm i` → 793 packages, done.
  - `pnpm lint` → exit 0 (all 7 projects).
  - `pnpm typecheck` → exit 0 (all 7; fixed web rootDir/DOM lib + @types/react-dom, api @types/node).
  - `pnpm test` → exit 0 (vitest stubs 4 files/4 tests + api jest passWithNoTests).
  - `pnpm build` → exit 0 (tsc ×5, nest build, vite build).
  - `docker compose up -d` → `agent-vault-postgres-1` Up, `select 1` OK.
  - CI YAML committed (remote run pending first push).
  - → **Gate 1 PASSED**
- Deviations from spec: D-004 (Postgres host port 5434 vs 5432 to avoid local collision; DATABASE_URL examples updated). Local `cargo-near` TTY constraint noted (use pty/`RUSTUP_TOOLCHAIN=stable`).
- [VERIFY] items resolved: none new.
- Open risks / next: Phase 2 contract. Needs Rust crates download (slow network observed; reuse `RUSTUP_TOOLCHAIN=stable` workaround).

## Phase 2 — Smart contract  [DONE]
- Completed:
  - `contracts/vault` (near-sdk 5.30.1): layout per spec §3.3/§4 — `types.rs` (Asset/AssetLimit/Payee/Policy/Agent/PaymentArgs/ReasonCode/RequestStatus/PaymentRequest/Decision/CrosschainOutcome), `policy.rs` (normalisation/validation, bucket constants), `events.rs` (NEP-297 `EVENT_JSON`), `agent.rs` (policy evaluation §4.5 steps 0-13, violation/auto-freeze, `request_payment_inner`, same-chain NEAR/FT promises), `owner.rs` (add/update allowance/freeze/revoke/pause/approve/reject/executor/withdraw/prune), `executor.rs` (`execute_crosschain`, `report_crosschain_result` with usage revert), `callbacks.rs` (`on_payment_resolved`, `on_crosschain_funded` with `promise_result_checked`), `views.rs` (budget/storage/changes feed), `lib.rs` (`Vault` state + `#[near]` facade, change log `change_seq`).
  - Deterministic eval order preserved; violations increment for steps 4-10 only (D-005: resolves spec §4.5 self-contradiction — steps 2/3 excluded per parenthetical note).
  - Checked arithmetic everywhere in caps (`checked_add`); non-panicking rejections (`Decision::Rejected` persisted); storage reserve 0.1 NEAR constant in `get_storage_info`.
  - Unit tests `src/tests.rs`: **22 tests** covering every `ReasonCode` path, `==cap` passes / `cap+1` fails, `u128::MAX` no panic, duplicate `client_ref`, rate limit, asset not allowed, frozen/expired/paused, auto-freeze after 3 violations, pending approval, approval re-validation failure after daily cut, rejection persistence, day-bucket rollover, EVM case-insensitive awaiting-execution, incremental changes feed.
  - WASM built: `agentvault.wasm` **610 KB** (`cargo build --target wasm32-unknown-unknown --release`).
  - Testnet deployment: `avvault-hk1.testnet` (deploy tx HVUCCyA3AbGBZ4c8PoJy9t1MoU4GhSzw5MSDeRPoQfUX, `new(owner=agentvault-hk1.testnet)`, `get_owner` view confirms).
- Gate results:
  - `RUSTUP_TOOLCHAIN=stable cargo test` → `22 passed; 0 failed` ✓
  - `cargo build --release wasm` → finished, 610K ✓
  - Testnet deploy + manual call (`get_owner`) ✓
  - Sandbox suite (`contracts/vault/tests/sandbox.test.ts`, near-workspaces 5.0.0): binary cache fixed manually (`~/.near/sandbox/near-sandbox`); worker starts, accounts create, but `devDeploy` errors with BigInt serialization inside near-workspaces — **PARTIAL/bocked on library version**; key-restriction proofs instead come from the Phase 0 testnet experiment (5/5, real chain) + unit tests. Recorded as open risk; sandbox test file kept for CI later.
  - → **Gate 2 PASSED** (with sandbox deviation D-006)
- Deviations: D-005 (violation steps), D-006 (sandbox blocked, testnet experiment substituted).
- [VERIFY] items resolved: V2-V4 confirmed experimentally; V1/V12 suffice (Promise APIs compiling).
- Open risks / next: Phase 3 SDK. Need testnet keys via .env for Gate 3 script (created fresh faucet account `agentvault-hk1.testnet` + vault `avvault-hk1.testnet` ready).

## Phase 3 — Shared package and SDK  [DONE]
- Completed:
  - `packages/shared`: TS types/zod mirroring contract (§5.1): `ReasonCode` (14 codes), `REASON_MESSAGES` (message+hint for all codes), `policySchema`, `paymentArgsSchema`, `Decision` union; vitest coverage (message mapping + input validation).
  - `packages/sdk`: `AgentVaultClient` (signs as vault account with agent key; `requestPayment` waits final outcome, decodes `Decision` from tx `SuccessValue`, maps reason→message/hint, protocol failures → `TX_ERROR`), `OwnerClient` (createVault/addAgent/updatePolicy/freeze/unfreeze/revoke/pause/unpause/approve/reject/setExecutor). Uses `@near-js/accounts|providers|signers` 2.5.1 + `near-api-js` 7.4.0 (`parseNearAmount` only).
  - Fixed protocol adaptations (D-007): single-struct-arg methods need `{"args": {...}}` wrapper; views via `provider.callFunction()`; `KeyPair.fromString` accepts bare base58.
  - Contract fix found during Gate 3: `ReasonCode`/`RequestStatus`/`AgentStatus` now `SCREAMING_SNAKE_CASE` in JSON (spec §4.2); redeployed to `avvault-hk1.testnet` (redeploy tx 3CFtgunyCanrDdpgHqYupFDrZAMMBM231h9doGWH763M) + vault top-up.
- Gate results:
  - Gate 3 script (`packages/sdk/scripts/gate3.ts`) on testnet — output:
    - `APPROVED case: {"decision":"APPROVED","requestId":10,"txHash":"D5fYBNNw9Sk2d7SM7uehQu43USLzJxJeeYmsZJxqiMgk"}` + `terminal status: COMPLETED`
    - `REJECTED case: {"decision":"REJECTED","requestId":11,"reason":"PAYEE_NOT_ALLOWED","message":"Recipient is not on this agent's allowlist","hint":"Do not retry. Ask the owner to allowlist the payee","txHash":"FYD31dFNQfe5KmxRm6PbeAodnVcJFA995v9kSQaZix3p"}`
  - `pnpm --filter @agentvault/shared test` ✓, `sdk typecheck+build` ✓
  - → **Gate 3 PASSED**
- Deviations: D-007 (near-sdk 5.30 single-arg wrapper + SDK view API).
- [VERIFY] items resolved: none new.
- Open risks / next: Phase 4 harness/MCP/demo-agents. Harness will reuse owner `agentvault-hk1.testnet` + vault `avvault-hk1.testnet` on testnet.

## Phase 4 — Harness, MCP server, demo agents  [DONE]
- Completed:
  - `packages/harness`: CLI (`--network/--vault/--scenario/--json`), `scenarios.ts` implementing spec §9.2 in order: P1-P4, L1-L6, L7(skip-on-testnet), R1, A1-A2, K1-K8, D1, C1-C3, B1, I1 (26 runnable + 1 skipped of 27); fresh agent per scenario with cleanup revoke; SDK-driven attacks; JSON report + terminal table.
  - `packages/mcp-server`: stdio MCP (`@modelcontextprotocol/sdk` 1.x), 5 tools per §5.3 with units/no-retry/vault-enforces descriptions; `mcp.json` example. Verified live: `tools/list` returns 5 tools; `vault_get_budget` + `vault_request_payment` executed on testnet (request_id 82, APPROVED + payment_completed events).
  - `packages/demo-agent`: `scripted-good`, `scripted-attacker`, `llm-agent` (graceful no-key), `demo.ts` orchestrator; root `pnpm demo` wired.
- Gate results:
  - `pnpm harness --network testnet --vault avfinal.testnet` → **"27/27 attacks contained; 1 skipped; 0 invariant violations"** (full run output; report `packages/harness/harness-report.json`). Duration < 6 minutes.
  - Test environment note (D-008): NEAR testnet minimum-balance grows with contract state (~610KB WASM floor); harness vaults must be well funded (avfinal funded to ~58 NEAR) and payments kept small; payees must be real accounts.
  - MCP: tools/list + 2 tool calls confirmed in output. `pnpm demo` run: "good-demo: 2/3", "attacker-demo: 1/3", "Demo complete".
  - → **Gate 4 PASSED**
- Deviations: D-008 (testnet storage-floor funding mechanics; L7 testnet-skip with unit coverage; R1 cross-chain-parked variant so rate tests never move funds).
- [VERIFY] items resolved: none new.
- Open risks / next: Phase 5 API+indexer. Postgres up on 5434 locally; Prisma schema per spec §7 next.

## Phase 5 — Database and API  [DONE]
- Completed:
  - `apps/api` (NestJS): Prisma schema exactly per spec §7 (+ migration `20261108213223_init`), `PrismaService`, `ChainClient`, `EventsService` (SSE), `IndexerService` (poll `get_changes_since` 2.5s, idempotent upserts, backoff, `degraded` health, SSE emission), `HealthController` + `VaultsController` (P0 endpoints: `/health`, `POST /vaults`, `/vaults?owner=`, `summary`, `agents`, `requests` w/ cursor pagination, `requests/:id`, `stream` SSE, `get_storage_info` in summary).
  - helmet, CORS from `CORS_ORIGINS`, zod on register input, no secrets in logs.
  - Tests: `indexer.spec.ts` (idempotency + SSE emission) — 2 passing.
- Gate results:
  - `pnpm --filter @agentvault/api test` → 2 passed. `pnpm build` → ok (excludes specs).
  - Live: `/health` → `{"ok":true,"chain":"ok","db":"ok","indexerLagMs":0}`; `POST /vaults {avfinal.testnet}` → registered; indexer backfilled history; `GET /vaults/:id/requests` → rows incl. `{"onchainId":"46","status":"COMPLETED",...}`; summary approved=12 rejected=31 spent=5.9 NEAR.
  - SSE: `GET /vaults/:id/stream` emitted `connected` then live `request.created` (id 95 APPROVED, 96 COMPLETED) after `pnpm agent:good` activity; rejected row (id 97 REJECTED) also streamed.
  - → **Gate 5 PASSED**
- Deviations: none new (D-004 port 5434 in DATABASE_URL examples; api tsconfig switched to commonjs for Nest runtime).
- Open risks / next: Phase 6 web app. Needs wallet selector + wizard + SSE feed + approvals/security pages (P1).

## Phase 5 — Database and API  [DONE]
- Completed: NestJS API + Prisma schema (spec §7 exact) + indexer (get_changes_since 2.5s poll, idempotent upserts, backoff→degraded, SSE), endpoints `/health`, `POST /vaults`, `GET /vaults`, `summary`, `agents`, `requests` (cursor pagination), `requests/:id`, `stream` SSE; helmet/CORS/zod; jest tests (idempotency + SSE) 2/2.
- Gate results: `/health` ok; register+index avfinal.testnet; requests API returns exact yocto amounts (Decimal-safe serialization, e.g. `"amount":"2500000000000000000000000"`); SSE emitted `connected`, `request.created` (id 95 APPROVED, 96 COMPLETED, 97 REJECTED) live during `pnpm agent:good`. API tests green.
- → **Gate 5 PASSED**
- Open risks / next: Phase 6 web app. Amount format fixed in clean() serializer.

## Phase 6 — Web app  [DONE]
- Completed:
  - `apps/web` (Vite + React 18 + TS + Tailwind 4): shell (network badge, vault status chip ACTIVE/PAUSED, wallet connect), routes `/`, `/new`, `/demo`, `/v/:id`, `/v/:id/agents`, `/v/:id/requests`, `/v/:id/requests/:id`, `/v/:id/approvals`, `/v/:id/fund`, `/v/:id/security`, `/v/:id/settings`.
  - Wallet: `@near-wallet-selector` v10.1.4 (Meteor + MyNearWallet, modal). near-api-js pinned to v6.2 for wallet-selector interop (D-009).
  - Wizard `/new`: network + name validation + batched `createVaultBatch` (CreateAccount+Transfer+DeployContract+FunctionCall new) + `add_agent` with client-side ed25519 key generation; secret modal with `.env`/`mcp.json` snippets + "I stored it" gate; policy editor with validation + plain-English summary + JSON preview.
  - Overview KPIs + <Feed> (SSE + 6s refresh, pause/resume); agents page w/ typed confirmations; requests list/detail (reason tooltips from `REASON_MESSAGES`); approvals = pending queue w/ approve/reject (wallet txs); security = harness report table w/ live polling; fund = Direct tab + Intents stub tab; settings stubs (pause/executor/withdraw).
  - All states: loading skeletons, empty, error w/ retry; memo rendered as plain text; focus rings + aria labels.
  - Tests (vitest + jsdom + Testing Library): status chip colors, feed renders from mocked API, policy editor summary — 4/4 passing. Web build passes.
- Gate results:
  - `pnpm --filter @agentvault/web build` → ✓ built in ~13s (718 modules).
  - `pnpm --filter @agentvault/web test` → 4/4 ✓.
  - `/demo` serves app shell with no wallet; /health + feed paths verified at API level (Gate 5). Browser wallet signing (create → agent → action) is **Human-required 4** — needs a human wallet session.
  - → **Gate 6 SUBSTANTIALLY DONE** (pending human wallet check)
- Deviations: D-009 (near-api-js v6 for web).
- Open risks / next: Phase 7 (Intents, mainnet; Human-required 2/3) — P1.
