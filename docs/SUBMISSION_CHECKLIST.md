# Submission checklist (spec §14 + HACKATHON.md)

Prepared but NOT sent. Send only after every row is verified — the form cannot
be edited after sending.

Legend: `[x]` verified in this repo, `[ ]` human action still required.

## Definition of done (§14)

- [x] Contract passes unit tests; K1–K5 proved on testnet that the agent key can
      do only `request_payment`.
- [x] `pnpm demo` and `pnpm harness` work from this repo — **27/27 attacks
      contained, 7/7 controls passed, 0 invariant violations**.
- [x] One-command demo: `docker compose up --build`, then open
      `http://localhost:8080`. No API key, wallet, or funded account required.
- [x] Web console verified on every route with zero console errors and
      Lighthouse 1.0 (accessibility, best practices, SEO) on `/`, `/app`,
      `/app/requests`, `/demo`, `/app/security`.
- [ ] Hosted public demo URL (Vercel/Netlify/VPS) → **human**: deploy the same
      Docker stack and keep it up through judging.
- [ ] At least one real NEAR Intents flow on mainnet with tiny funds →
      **human-required #2/#3** (mainnet accounts + approval). Executor code and
      mocked tests are done (Phase 7).
- [x] MCP server works from a standard MCP client using the README `mcp.json`
      snippet (verified: `tools/list` + `tools/call`).
- [x] README follows "do X, see Y" with expected outputs; the threat model and
      [limitations.md](limitations.md) state the honest gaps.
- [ ] Repo public by the deadline; X post published with video/screenshots
      mentioning NEAR HACKATHON; form submitted → **human-required #6**.

## Verification log (this machine)

| Gate | Command | Result |
|---|---|---|
| Build | `pnpm build` | Pass |
| Types | `pnpm typecheck` | Pass (9 workspaces) |
| Tests | `pnpm test` | shared 8, localchain 5, sdk 3, mcp-server 1, api 15, web 15 |
| Harness | `pnpm harness` | 27/27 attacks, 7/7 controls, 0 invariant violations |
| Stack | `docker compose up -d` | db + api + web healthy |
| Live updates | send a payment in `/app/requests` | appears in ~1 s over SSE |
| Docs | `/docs/` + every footer link | 200; `.md` served as `text/plain` |
| Responsive | 13 routes at 390 / 768 / 1440 px | 0 px horizontal overflow |
| Lighthouse | 10 routes (landing, console, ledger, demo, security, agents, approvals, fund, settings, new vault) | 1.0 / 1.0 / 1.0, 0 console errors |

Contract compilation and Rust tests run in CI and the `Dockerfile.contract`
image; they need a Rust toolchain and are not run on this host.

## HACKATHON.md requirements

- [ ] Repository public by deadline → human (git push + make public).
- [ ] X post: says built at NEAR HACKATHON, tags @NEARProtocol + #NEARHackathon,
      attaches video or screenshots → draft below; human posts.
- [ ] One submission via POST https://nearhackathon.com/api/applications after
      the human confirms the exact payload (print the full JSON first).
- [x] Submission API fields known: requestId (generate once, reuse on retries),
      projectName, leadName, email (≤2 submissions/email), size, tracks
      (`["security","agents","defi"]`), nearAddress (mainnet, human-created),
      projectUrl, demoUrl, idea (20–2000 chars), consent=true.
- [x] `website` field must NOT be set (spam trap).
- [ ] Video ≤3 min (shot list below). Screenshots alone are insufficient.

## X post draft

AgentVault: give your AI agent a wallet it can't abuse.

🛡️ Locked NEAR vault; agent key restricted by the protocol to ONE method
🧱 Policy enforced on-chain (allowlist, caps, rate limits, auto-freeze)
🔴 Red-team harness: 27/27 attacks contained — including prompt injection

Demo: <video link>
Repo: <repo link> · Live: <web link>
Built for NEAR HACKATHON @NEARProtocol #NEARHackathon

## Video shot list (≤3 min, spec §12.2)

1. 0:00–0:20 Landing + diagram: "agents with hot wallets can be drained"
2. 0:20–1:00 Create vault → add agent → key modal → fund
3. 1:00–1:40 Legit payments; feed green; a cross-chain payout lands
4. 1:40–2:30 Prompt-injection/attack: red rows, reason codes, auto-freeze; owner revokes
5. 2:30–3:00 Security page 27/27, repo, README steps

## API-key provisioning for the demo

The default stack needs **no secrets**. `cp .env.example .env` and fill only the
block for the feature you use:

| Block | Variables | Needed for |
|---|---|---|
| Core | `POSTGRES_*`, `API_PORT`, `WEB_PORT`, `NEAR_NETWORK` | Everything (safe defaults). |
| Testnet deploy | `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `VAULT_ACCOUNT_ID` | `pnpm deploy:testnet`, testnet harness. |
| Harness funder | `HARNESS_OWNER_ACCOUNT_ID`, `HARNESS_OWNER_PRIVATE_KEY` | API-hosted harness on testnet. |
| Cross-chain | `EXECUTOR_ACCOUNT_ID`, `EXECUTOR_PRIVATE_KEY`, `ONECLICK_API_URL`, `ONECLICK_JWT` | Real NEAR Intents payouts (mainnet). |
| LLM agent | `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | `pnpm agent:llm` only. |

The owner key is never an environment variable; it is signed in the browser
wallet.

## Form answers (draft — human confirms each)

- projectName: AgentVault
- tracks: `["security"]` (optionally + "agents" + "defi")
- idea (~900 chars): see spec §12.4 draft (fits 20–2000).
- nearAddress: **human-required — human creates a mainnet account; never invent.**
- projectUrl / demoUrl / email / leadName / size / consent: **human-supplied.**
