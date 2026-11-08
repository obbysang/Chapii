# AgentVault — Give your AI agent a wallet it can't abuse

## 1. What it is
AgentVault is a policy-enforced treasury on NEAR for AI agents that spend money. The vault is a locked contract account (no full-access keys); each agent gets a NEAR function-call access key restricted by the protocol to a single method (`request_payment`), so even a fully compromised agent cannot move funds directly.

## 2. The problem it solves
- Developers give agents hot private keys — a prompt-injected or hijacked agent can drain them.
- "Spending limits" implemented in the agent framework live in the same process as the attacker and are bypassed when the agent is compromised.
- AgentVault enforces limits on-chain (NEAR protocol + Rust contract), not by the agent's good behaviour.

## 3. NEAR technologies used
- Function-call access keys as the agent permission layer (protocol-enforced single-method restriction).
- Locked account / no full-access keys (october signers can't bypass the contract).
- Sub-accounts per vault (factory-style creation).
- NEAR Intents (1-Click API) for cross-chain funding and payouts (P1).
- Agent keys identified on-chain via `signer_account_pk()`.

## 4. Live links
- App: _pending Phase 8 deployment_
- Demo vault (explorer): _pending_
- Video: _pending_
- X post: _pending_

## 5. Try it in 5 minutes
- `git clone <repo> && pnpm i` → installs without errors.
- Fill `.env` from `.env.example` (testnet faucet account) → file filled.
- `pnpm demo` → prints "Vault created: <id>", "Agent added", "Good agent: 3/3 payments approved".
- `pnpm harness --network testnet` → prints a table ending "26/26 attacks contained, 0 invariant violations".
- Open `<web url>/demo` → live feed shows approved (green) and rejected (red) rows; click a red row → reason `PAYEE_NOT_ALLOWED`.
- Click **Run attack suite** in the UI → progress streams; final banner reads "26/26 contained".
- (Optional) `LLM_API_KEY=… pnpm agent:llm` → prints whether the model attempted the injected payment and that the vault blocked it.

## 6. Architecture
See `docs/architecture.md`. Threat model (including the honest cross-chain executor limitation from spec §4.9) in `docs/threat-model.md`. API reference in `docs/api.md`.

## 7. Repo map
`contracts/vault` Rust contract · `packages/{shared,sdk,mcp-server,harness,demo-agent}` · `apps/{api,web}` · `scripts/` deploy/seed · `docs/`.

## 8. Running tests
`pnpm lint && pnpm typecheck && pnpm test` + `cargo test --manifest-path contracts/vault/Cargo.toml`. CI status badge: _pending_.

## 9. Deploy your own
See `docs/api.md` and `scripts/deploy-testnet.ts`.

## 10. Roadmap
TEE executor with code-hash attestation, multi-sig owner, more chains, global contracts.

## 11. Libraries used
NEAR SDK (Rust), near-api-js/@near-js, @near-wallet-selector, @modelcontextprotocol/sdk, NestJS, Prisma, React, Vite, TanStack Query, Tailwind (as applicable per phase).
