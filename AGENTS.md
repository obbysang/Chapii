# AGENTS.md — how to run, test and verify AgentVault in under 10 commands

Repo: pnpm monorepo (TypeScript strict) + Rust contract. Node 20+ required; Rust stable needed only for contract rebuilds.

```
pnpm i                                        # install
docker compose up -d                           # Postgres on :5434
pnpm lint && pnpm typecheck && pnpm build && pnpm test
cargo test --manifest-path contracts/vault/Cargo.toml        # 22 unit tests
pnpm --filter @agentvault/api exec prisma migrate dev --name init
DATABASE_URL=postgresql://agentvault:agentvault@localhost:5434/agentvault pnpm --filter @agentvault/api start
curl localhost:3100/health                     # {"ok":true, ...}
pnpm harness --network testnet --vault <vault> # 27/27 attacks contained
```

## Conventions for an AI reviewer
- Contract state is truth; DB is a read-model. Never put policy logic outside the contract.
- Agent keys: function-call keys restricted to `request_payment` on the vault. Identity via `signer_account_pk()`.
- Non-panicking rejections: `request_payment` returns `Decision` variants, never panics on policy violations.
- Secrets: `.env` files only, never committed (pre-commit hook scans); see `.env.example` at root, `apps/api`, `packages/mcp-server`, `packages/demo-agent`, `apps/web`.
- Testnet accounts in this repo's evidence were created with the public faucet: `avvault-hk1.testnet`, `avfinal.testnet` (vaults), `avpayee.testnet` (payee). Keys live in `~/.near-credentials` (not in git).
