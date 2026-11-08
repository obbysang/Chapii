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
