# AgentVault

Give your AI agent a wallet it can't abuse.

---

## 1. What it is

AgentVault is a policy-enforced treasury on NEAR for AI agents that spend money. The vault is a locked contract account (no full-access keys); each agent gets a NEAR function-call access key restricted by the protocol to a single method (`request_payment`), so even a fully compromised agent cannot move funds directly.

## 2. The problem it solves

- Developers give agents hot private keys — a prompt-injected, buggy or hijacked agent can drain them.
- "Spending limits" implemented in the agent framework live in the same process as the attacker and are bypassed when the agent is compromised.
- AgentVault enforces limits on-chain (NEAR protocol + Rust contract), not by the agent's good behaviour.

## 3. NEAR technologies used

- **Function-call access keys** as the agent permission layer (`request_payment` only, receiver = vault).
- **Locked account / no full-access keys** — the vault is controlled only by the contract.
- **Sub-accounts per vault** for factory-style creation.
- **NEAR Intents (1-Click API)** for cross-chain funding and payouts (P1, mainnet).
- **`signer_account_pk()`** identifies agents on-chain.

## 4. Live links

- App: _pending Phase 8 deployment_
- Demo vault (explorer): https://explorer.testnet.near.org/accounts/avfinal.testnet
- Video: _pending_
- X post: _pending_

## 5. Try it in 5 minutes

Each step is "do X → see Y".

1. `git clone <this-repo> && pnpm i` → installs without errors.
2. `cp .env.example .env` and set `NEAR_ACCOUNT_ID`/`NEAR_PRIVATE_KEY` (create a testnet account: https://wallet.testnet.near.org, faucet https://docs.near.org/getting-started/faucet) → `.env` filled.
3. `docker compose up -d` → Postgres healthy on port 5434.
4. Deploy + run the API: `DATABASE_URL=... pnpm --filter @agentvault/api start` → `curl localhost:3100/health` → `{"ok":true,"chain":"ok","db":"ok",...}`.
5. `pnpm demo` → prints `Vault ready…`, `Agent added: …`, `good-demo: 2/3`, `attacker-demo: 1/3`, `Demo complete`.
6. `pnpm harness --network testnet` → table ends with `27/27 attacks contained; 1 skipped; 0 invariant violations`.
7. Open `<web url>/demo` → live feed shows approved (green) and rejected (red) rows; click a red row → reason `PAYEE_NOT_ALLOWED`.
8. Click **Run attack suite** in the UI → progress streams; final banner reads "27/27 contained".
9. (Optional) `LLM_API_KEY=… pnpm agent:llm` → prints whether the model attempted the injected payment and that the vault blocked it.

## 6. Architecture

See [docs/architecture.md](docs/architecture.md). Threat model (including the honest cross-chain executor limitation from spec §4.9) in [docs/threat-model.md](docs/threat-model.md). API reference in [docs/api.md](docs/api.md).

## 7. Repo map

`contracts/vault` Rust contract · `contracts/mock-ft` · `packages/{shared,sdk,mcp-server,harness,demo-agent}` · `apps/{api,web}` · `scripts/` · `docs/`.

## 8. Running tests

- `pnpm lint && pnpm typecheck && pnpm build && pnpm test` → all green.
- `cargo test --manifest-path contracts/vault/Cargo.toml` → `22 passed`.
- Contract sandbox/key tests: Phase 0 testnet experiment (5/5 checkpoints, real chain) + `contracts/vault/tests/sandbox.test.ts` (library-version blocked, D-006).
- API: `pnpm --filter @agentvault/api test` → 4 passed.

## 9. Deploy your own

Contract: `scripts/deploy-testnet.ts` (testnet) / `scripts/deploy-mainnet.ts` (mainnet, owner's keys via env — human step). API: `apps/api/Dockerfile`. Web: `pnpm --filter @agentvault/web build` → static hosting.

## 10. Roadmap

TEE executor with code-hash attestation, multi-sig owner, more chains, global contracts.

## 11. Libraries used

near-sdk 5.30.1 (Rust), @near-js/accounts/providers/signers 2.5.1 + near-api-js 7.4, @near-wallet-selector 10.1.4, @modelcontextprotocol/sdk, NestJS 11, Prisma 6, React 18, Vite 6, Tailwind 4.

## 12. Built for the NEAR HACKATHON

Track: AI Security & Defense. Submission fields, X post and video are prepared in `docs/SUBMISSION_CHECKLIST.md`.
