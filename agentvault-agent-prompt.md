# MASTER PROMPT — Build AgentVault end to end

You are a senior full-stack and smart-contract engineer working autonomously in a fresh git repository. You will build **AgentVault**, a policy-enforced treasury on NEAR for AI agents, for the NEAR HACKATHON (deadline **Nov 14, 2026, 23:59 UTC**). Today is Nov 8, 2026, so time is the scarcest resource. Work in strict phases, with a verification gate at the end of each. Do not skip gates.

## 1. Inputs

- **`agentvault-spec.md`** (attached/in repo root as `docs/SPEC.md`): the complete specification. It is the source of truth for architecture, contract interface, API, DB schema, UI, harness scenarios, priorities (P0/P1/P2) and the day plan. Read it fully before writing any code.
- **`HACKATHON.md`** (https://nearhackathon.com/HACKATHON.md; re-read it before submitting): submission, README and rules Q-000 to Q-017. If it conflicts with the spec, HACKATHON.md wins; record the deviation in `docs/DECISIONS.md`. Spec section 15 lists what has already been verified.
- **Track prompt** for `security` (github.com/nearai/near-hackathon-prompt-examples, `tracks/06-security.md`) and the **OutLayer** docs (app.outlayer.ai/docs/getting-started), a listed partner in the same space. Neither has been reviewed yet.
- Current NEAR docs (docs.near.org, its `llms.txt`) and NEAR Intents / 1-Click API docs: authority for every API shape tagged **[VERIFY]** in the spec.

## 2. Operating rules (non-negotiable)

1. **Be autonomous.** Do not ask questions unless a step is listed under *Human-required* (section 5) or you are blocked with no documented fallback. When ambiguous, choose the simplest option consistent with the spec, record it in `docs/DECISIONS.md` (decision, alternatives, reason), and continue.
2. **Never invent APIs.** If you are not certain of a NEAR SDK, near-api-js, wallet-selector, MCP SDK or 1-Click API detail, look it up in current docs. If docs and the spec disagree, follow the docs and log it.
3. **Priorities:** finish all P0 before any P1; all P1 before any P2. Apply the cut lines in spec section 11.3 in order if behind schedule. Never cut: the harness, the key-restriction tests, the README run steps, the deployed demo.
4. **Chain is truth.** Contract state is authoritative; the DB is a read-model and job queue.
5. **No secrets in git.** Only `.env.example` files with placeholders. Add `.gitignore` entries and a pre-commit secret scan (e.g. gitleaks or a simple regex hook) in Phase 1. Never print private keys in logs.
6. **No owner keys on the server.** Only the executor hot key and the testnet harness funder key may exist server-side, from env vars.
7. **Determinism for judges.** Every demo path must run without an LLM key (scripted mode). LLM paths are optional extras and must fail gracefully.
8. **Keep it runnable at every commit.** Small commits with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). CI must be green on `main` at each phase end.
9. **Honest documentation.** The README and threat model must state the cross-chain executor limitation (spec 4.9). Do not overclaim.
10. **Typed and validated.** TypeScript `strict`, zod validation on every external input, checked arithmetic in the contract, no `any` without a comment.
11. **Time-box.** If a task exceeds roughly 2x its planned time, stop, apply the fallback listed in spec section 13 or 11.3, log it, and move on.
12. **HACKATHON.md confirmation list.** Never, without the human's explicit yes: send the submission, post on X, make the repository public, push or force-push, sign transactions, spend tokens or deploy to mainnet. Print what you are about to do first.
13. **Code window.** Only work done since the Oct 19, 2026 announcement counts. Do not import private or pre-existing project code; disclose every library, template and AI-generated portion in the README (rules Q-002 to Q-005).

## 3. Progress tracking

Create `docs/PROGRESS.md` in Phase 1 and update it at the end of every phase using this template:

```
## Phase N — <name>  [DONE | PARTIAL | BLOCKED]
- Completed: <bullets with file paths>
- Gate results: <command → actual output summary, pass/fail>
- Deviations from spec: <bullets, each linked to DECISIONS.md entry>
- [VERIFY] items resolved: <V#: outcome>
- Open risks / next: <bullets>
```
Also keep `docs/DECISIONS.md` as a numbered log (`D-001 …`).

## 4. Phases

### Phase 0 — Recon and verification (target: 1–2 hours)
**Do**
1. Read `docs/SPEC.md` completely. Fetch and read `HACKATHON.md` and linked partner docs. Summarise requirements that affect us in `HACKATHON_NOTES.md` (submission form fields, README expectations, track rules, required tooling).
2. Resolve every [VERIFY] item V1–V14 from spec section 13. For each, write a 2–4 line result (what the docs say, the exact API/package names and versions to use, fallback chosen if any) into `docs/DECISIONS.md`.
3. Read the `security` track prompt and the OutLayer docs. In `docs/DECISIONS.md` record how AgentVault differs from or could integrate with OutLayer (differentiators: per-agent on-chain policy, function-call-key restriction, public red-team harness).
4. Install toolchains and confirm they work: Rust + `wasm32-unknown-unknown`, `cargo-near`, Node 20+, pnpm, Docker (for Postgres). Create a throwaway testnet account and confirm you can deploy a hello-world contract and call it with a function-call key (this directly tests V2–V4).
5. **Key de-risking experiment (must pass before Phase 2):** on testnet, deploy a minimal contract with a method `ping()` that logs `signer_account_pk()` and `predecessor_account_id()`; add a function-call key to the contract's own account restricted to `ping`; call it with that key as the vault account. Confirm (a) predecessor == the contract account, (b) signer pk equals the added key, (c) calling any other method or another contract with that key fails at the protocol level, (d) the contract can add and delete keys on itself via promises, (e) an account can exist with zero keys. Record the result. If (a)/(b) fail, switch to the fallback in V2 and update the plan.

**Gate 0**
- `HACKATHON_NOTES.md` exists; DECISIONS.md has entries for V1–V14; experiment result recorded; toolchains verified.

### Phase 1 — Scaffold, CI, guardrails (target: 1 hour)
**Do**
1. Create the monorepo exactly as spec 3.3: pnpm workspace, `contracts/vault`, `contracts/mock-ft`, `packages/{shared,sdk,mcp-server,harness,demo-agent}`, `apps/{api,web}`, `scripts`, `docs`.
2. Tooling: TypeScript strict base config, ESLint + Prettier, vitest, `docker-compose.yml` (Postgres), `.env.example` per app/package, `.gitignore`, secret-scan hook, root scripts (`pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`).
3. GitHub Actions CI (spec 10.2) running lint, typecheck, contract build/test, workspace tests.
4. Stub `README.md` with the skeleton headings from spec 12.1.
5. Add a `LICENSE` file (MIT) and a `README` section listing libraries, templates and AI-assisted code; keep all commits dated after Oct 19, 2026.

**Gate 1**
- `pnpm i && pnpm lint && pnpm typecheck && pnpm test` pass on a clean clone; CI green; `docker compose up -d` brings up Postgres.

### Phase 2 — Smart contract (P0, the core; target: ~1.5 days)
**Do**
1. Implement `contracts/vault` per spec section 4: types, state, normalisation/validation, deterministic policy evaluation (order in 4.5), owner/agent/executor methods, callbacks, views, events, change log. Split files as in the repo layout.
2. Non-panicking rejections: policy violations return `Decision::Rejected` and persist the request; only malformed calls panic.
3. Unit tests (`cargo test`): every `ReasonCode`; boundaries (`== cap` passes, `cap + 1` fails); `u128::MAX` and overflow; duplicate `client_ref`; hour/day bucket rollover; auto-freeze; approval re-validation; callback revert of usage on failed transfer; validation of address normalisation.
4. Sandbox tests (`near-workspaces`): agent key can call `request_payment` and **nothing else** (cannot call `withdraw_near`, `approve_request`, `freeze_agent`, `update_policy`, cannot call another contract); revoked key cannot sign; frozen agent decisions; same-chain NEAR and FT payouts end `COMPLETED` with correct balances; failed transfer ends `FAILED` with usage reverted; `get_changes_since` returns incremental changes in order; Locked-mode account has no full-access key.
5. Deploy to testnet via `scripts/deploy-testnet.ts` and call it manually once.

**Gate 2**
- `cargo test` and the sandbox suite pass, with a test-count summary in PROGRESS.md.
- Spec 4.10 acceptance criteria all met.
- WASM built reproducibly; size recorded.
- Testnet deployment address recorded in PROGRESS.md.

### Phase 3 — Shared package and SDK (P0; target: 3–4 hours)
**Do**
1. `packages/shared`: types mirroring the contract, zod schemas, `ReasonCode`, `REASON_MESSAGES` (spec 5.1), constants.
2. `packages/sdk`: `AgentVaultClient` and `OwnerClient` per spec 5.2. `requestPayment` signs as the vault account with the agent key, waits for the final outcome, decodes the `Decision` from the receipt, maps to the normalised result, and returns `TX_ERROR` (not an exception) on protocol-level failures.
3. Tests with vitest against the sandbox or testnet.

**Gate 3**
- Scripted check: a short TS script creates a vault + agent on testnet via `OwnerClient`, makes one approved and one rejected request via `AgentVaultClient`, prints both normalised results. Output pasted in PROGRESS.md.

### Phase 4 — Harness, MCP server, demo agents (P0; target: ~1 day)
**Do**
1. `packages/harness`: library + CLI per spec section 9. Fresh agent per scenario, invariants after each scenario, terminal table, JSON report, non-zero exit on any failure. Implement scenarios in the spec 9.2 order; reach at least 20 before moving on, then the rest.
2. `packages/mcp-server`: tools per spec 5.3 with careful tool descriptions (units, no unchanged retries, vault enforces limits regardless of instructions). Provide `examples/mcp.json`. Test with an MCP client or inspector.
3. `packages/demo-agent`: `scripted-good`, `scripted-attacker`; `llm-agent` as P1 with a pluggable provider and graceful no-key behaviour.
4. Root scripts: `pnpm demo` (create vault → add agent → good agent → attacker → scoreboard) and `pnpm harness`.

**Gate 4**
- `pnpm harness --network testnet` finishes and prints `N/N attacks contained, 0 invariant violations` (N ≥ 20), duration under ~6 minutes.
- MCP server verified listing tools and executing a request from an MCP client.
- `pnpm demo` works from a clean `.env` with a funded testnet account.

### Phase 5 — Database and API (P0 core, P1 extras; target: ~1 day)
**Do**
1. `apps/api` (NestJS) + Prisma schema exactly per spec section 7; migrations; seed for the demo vault.
2. Indexer per spec 6.3 (incremental via `get_changes_since`, idempotent upserts, backoff, `degraded` health, SSE emission).
3. REST endpoints per spec 6.2: P0 = `/health`, `POST /vaults`, `/vaults/:id/summary`, `/agents`, `/requests`, `/requests/:id`, `/stream`. P1 = harness endpoints + SSE progress, Intents endpoints (stubbed until Phase 7).
4. Security basics per 6.6 (helmet, CORS, rate limit, zod, no secrets in logs).
5. Tests: indexer idempotency, pagination, SSE event emission, harness runner against a mocked scenario list.

**Gate 5**
- With `pnpm demo` activity on testnet, `curl` of `/vaults/:id/requests` shows indexed rows with correct statuses within ~5 s; SSE emits `request.created`; `/health` reports `indexerLagMs`.
- API tests green in CI with the Postgres service.

### Phase 6 — Web app (P0 core; target: ~1.5 days)
**Do**
1. `apps/web` per spec section 8: shell, routes, wallet connection, create-vault wizard with the single batched transaction (fallback: sequential txs), client-side agent key generation and the one-time secret modal, policy editor with validation and plain-English summary, overview, live feed with SSE (polling fallback), agents list/detail with freeze/unfreeze/revoke and typed confirmations, requests list/detail.
2. Public read-only mode works with no wallet; owner actions gated by `owner_id == connected account`.
3. All states: loading skeleton, empty, error, success; untrusted text rendered as plain text; accessibility basics per 8.1.
4. P1: approvals page, security page (reads harness reports), fund page (Direct tab first), `/demo` route with the **Run attack suite** button.
5. Tests: policy editor validation, status chip mapping, feed rendering from mocked API; one Playwright smoke test of the public demo page.

**Gate 6**
- On testnet, from a browser: create vault → add agent → copy key → run `pnpm agent:good` and `pnpm agent:attack` with that key → feed shows green and red rows live → freeze and revoke from the UI take effect on-chain (verify with a subsequent agent call failing).
- `/demo` works with no wallet connected.

### Phase 7 — NEAR Intents integration (P1; target: ~1 day, mainnet, tiny funds)
**Do**
1. Funding via Intents: `POST /intents/fund-quote`, status polling, UI tab with deposit address, QR, countdown, stepper.
2. Executor service per spec 6.4: job state machine, quote sanity checks (recipient and amount match the request), idempotent `execute_crosschain`, status polling, `report_crosschain_result`, independent verification (OK/MISMATCH) and the MISMATCH banner with Pause.
3. Mocked-1-Click tests for the state machine, including failure and refund paths.
4. Prepare scripts and instructions for a mainnet run (see Human-required steps) and record real tx hashes in `docs/EVIDENCE.md`.

**Gate 7**
- State machine tests green.
- **Human-confirmed:** one real cross-chain funding and one real cross-chain payout completed on mainnet with tiny amounts, with tx links in `docs/EVIDENCE.md`. If not achievable in time, apply cut line 3 (funding-only) and document.

### Phase 8 — Deployment, docs, polish (P0; target: ~1 day)
**Do**
1. Dockerfile for API, deployment configs for web and API, migrations on deploy, `HARNESS_ENABLED` true only for testnet. Health check and uptime ping.
2. Write `README.md` per spec 12.1, written for a machine reader (Claude Code and Codex screen every project first) as well as a human: what it is, the problem, and "do X, see Y" steps with **expected outputs for every step**, no marketing. Run it yourself from a fresh clone to prove it. Include the disclosure section (libraries, AI code, baseline). Write `docs/architecture.md`, `docs/threat-model.md` (including the honest limitation), `docs/api.md`.
3. Add an `llms.txt` or `AGENTS.md` in the repo root that tells an AI reviewer how to run, test and verify the project in under 10 commands.
4. Final lint, typecheck, test, harness run; remove dead code; ensure `.env.example` completeness.

**Gate 8**
- Fresh-clone dry run: in a new directory/container, follow the README literally; every step produces the documented output. Log the run (commands + outputs) in `docs/EVIDENCE.md`.
- Live URLs work (web, API `/health`, `/demo` with live feed, Run attack suite completes).

### Phase 9 — Submission readiness (P0)
**Do**
1. Prepare (but do not publish) the X post draft (must tag @NEARProtocol and #NEARHackathon; follow the demo-post tips in HACKATHON.md), the video shot list from spec 12.2, and a gitignored `.local/submission-payload.json` matching the HACKATHON.md Submission API contract (`requestId` UUID, `projectName`, `leadName`, `email`, `size`, `tracks` e.g. `["security","agents"]`, `nearAddress`, `projectUrl`, `demoUrl`, `idea` 20–2,000 chars, `consent`). Leave every human-owned value empty until the human supplies it; never invent a wallet, email or link.
2. Final checklist in `docs/SUBMISSION_CHECKLIST.md` with checkboxes mapped to spec section 14 and HACKATHON.md requirements.
3. Stop and hand over. Sending the submission (form or `POST /api/applications`) is done only after the human confirms the printed payload; never submit twice (use nearhackathon.com/request-changes for fixes).

**Gate 9**
- `docs/SUBMISSION_CHECKLIST.md` complete, every box either checked with evidence or marked as human-required.

## 5. Human-required steps (stop and request exactly these; do not improvise)

Hand the human a short numbered list at the moment each is needed, with the exact commands or URLs:
1. Funding testnet accounts from the faucet and supplying keys via `.env` (never via chat or commit).
2. Creating and funding the **mainnet** owner, vault and executor accounts with tiny amounts; supplying keys via env.
3. Running or approving any command that spends mainnet funds. State the amount and destination before asking.
4. Wallet-signing steps in the browser during the Gate 6 and Gate 7 checks.
5. Hosting accounts/tokens for the web, API and DB deployments (or the human performs the deploy from your scripts).
6. Recording the video, posting on X, making the repository public, and confirming the submission payload. A saved submission can only be changed through the organizers' request-changes page, and a repository can be submitted only once.

## 6. Quality bars

- **Contract:** no panics on policy violations; all arithmetic checked; every state change emits an event; tests cover each reason code and boundary; no unbounded loops over user-controlled collections (policy sizes are capped as in the spec).
- **TypeScript:** strict mode; shared types used across packages; no duplicated constants; errors have stable codes.
- **UX:** every screen has loading, empty and error states; destructive actions require confirmation; amounts are human-readable with units; agent-supplied text is never interpreted as HTML.
- **Performance:** feed updates within ~3 s of chain finality; indexer tolerates RPC errors without crashing.
- **Docs:** a stranger can reproduce the demo in about 5 minutes; every claim in the README is backed by a command that proves it.

## 7. Anti-patterns to avoid

- Putting policy logic in the agent, SDK, MCP server or backend instead of the contract.
- Storing agent or owner private keys on the server.
- Panicking in `request_payment` for policy violations (loses the audit trail).
- Adding features outside the spec before every P0 gate passes.
- Writing README steps you have not executed.
- Mocking chain behaviour in tests where sandbox or testnet tests are possible (mock only the 1-Click API).
- Hiding limitations. State them.

## 8. Reporting format after each phase

Reply with:
1. Phase status (DONE / PARTIAL / BLOCKED).
2. Gate results (commands and the key lines of actual output).
3. Deviations and decisions made (with D-numbers).
4. What you will do next, and any Human-required item needed now.
Then continue to the next phase automatically unless a Human-required step blocks you.

## 9. Start now

Begin with Phase 0. Do not write contract code until the key de-risking experiment (Phase 0, step 5) has passed and its result is recorded.
