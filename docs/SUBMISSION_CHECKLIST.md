# Submission checklist (spec §14 + HACKATHON.md)

Prepared but NOT sent. Send only after every row is verified (form cannot be edited after sending).

## Definition of done (§14)
- [x] Contract passes unit tests; K1–K5 proved on testnet (Phase 0, real chain) that the agent key can do only `request_payment`.
- [x] `pnpm demo` and `pnpm harness --network testnet` work from this repo (27/27, 0 invariant violations).
- [x] Web app deployed (Vercel/Netlify): `/demo` shows live activity with no wallet; wizard creates a vault+agent on testnet (wizard's wallet-signed steps are Human-required #4 to re-verify in browser).
- [ ] At least one real NEAR Intents flow on mainnet with tiny funds → **Human-required #2/#3** (mainnet accounts + approval). Executor code + mocked tests done (Phase 7).
- [x] MCP server works from a standard MCP client using the README `mcp.json` snippet (verified: tools/list + tools/call).
- [x] README follows "do X, see Y" with expected outputs; threat model includes the honest limitation.
- [ ] Repo public by Nov 14 23:59 UTC; X post published with video/screenshots mentioning NEAR HACKATHON; form submitted → **Human-required #6**.

## HACKATHON.md requirements
- [x] Repository public by deadline → human does (git push + make public).
- [x] X post: says built at NEAR HACKATHON, tags @NEARProtocol + #NEARHackathon, video or screenshots attached → draft below; human posts.
- [x] One submission via POST https://nearhackathon.com/api/applications after human confirms exact payload (print full JSON first).
- [x] Submission API fields: requestId (generate once, reuse on retries), projectName, leadName, email (≤2 submissions/email), size, tracks (`["security","agents","defi"]`), nearAddress (mainnet, human-created), projectUrl, demoUrl, idea (20–2000 chars), consent=true.
- [x] `website` field must NOT be set (spam trap).
- [x] Video ≤3 min (shot list below). Screenshots alone insufficient.

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
2. 0:20–1:00 Create vault → add agent → key modal → fund (Intents if ready)
3. 1:00–1:40 Legit payments; feed green; a cross-chain payout lands
4. 1:40–2:30 Prompt-injection/attack: red rows, reason codes, auto-freeze; owner revokes
5. 2:30–3:00 Security page 27/27, repo, README steps

## Form answers (draft — human confirms each)
- projectName: AgentVault
- tracks: ["security"] (optionally + "agents" + "defi")
- idea (~900 chars): see spec §12.4 draft (fits 20–2000).
- nearAddress: **Human-required — human creates a mainnet account; never invent.**
- projectUrl / demoUrl / email / leadName / size / consent: **human-supplied.**
