# HACKATHON_NOTES — NEAR HACKATHON mapping

Source: live https://nearhackathon.com/HACKATHON.md (fetched 2026-11-08, 246 lines) + https://nearhackathon.com/ form. If HACKATHON.md conflicts with agentvault-spec.md, HACKATHON.md wins (per spec §0 and master prompt 1).

## Dates (all UTC)
- Hackathon 2026-11-01 00:00 → submission deadline 2026-11-14 23:59 (we target ~20:00)
- Judging 2026-11-16 → 2026-11-18 23:59, results by then
- Session today 2026-11-08 → 6 days left. Spec day plan (§11.2) maps directly.

## Submission (one per project, not editable after sending; changes only via https://nearhackathon.com/request-changes)
- API: POST https://nearhackathon.com/api/applications, body ≤12000 bytes, fields exactly: requestId (UUID, generate once, reuse on retry), projectName (2-80), leadName (2-80), email (max 160, ≤2 submissions/email), size (`1`|`2 - 4`|`4 - 6`|`6 - 8`|`8+`), tracks[] (ids below, each once), nearAddress (mainnet named or 64-char implicit, regex `^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$`; **must be created by human, never invented**), projectUrl (http(s) public repo, max 300, unique/submitted once), demoUrl (http(s) X post, max 300), idea (20-2000 chars), consent=true (after reading contact notice verbatim). No extra fields — `website` non-empty = spam trap / reject.
- 201 saved; 400 fix `fields` resend same requestId; 403 closed/cross-site → tell human; 409 repo already submitted (do not relink); 413 shorten; 503 retry same requestId.
- Form alternative: https://nearhackathon.com/#apply (same fields).

## What must be human-supplied (see master prompt §5; do not guess)
Project name, lead name, email, team size, tracks, mainnet payout account, repo link, demo-post link, idea text, consent. Draft idea (~900 chars) is in spec §12.4 — fits 20-2000, will be final-checked in Phase 9.

## Tracks
13 ids: `defi thesis privacy business swarms security agents realworld games nfts memecoins social open`. AgentVault fits **`security`** (AI Security & Defense — hints: agent security, function-call keys, TEE attestation; exact match for our design) + defensibly `agents` (agent commerce) and `defi` (vaults). Tracks are hints, not requirements (Q-011); README must name how NEAR features are used. Final selection is human's at submission (Phase 9).

## Rules that shape the build (Q-xxx)
- Q-001: code since announcement 2026-10-19 counts; earlier = baseline. Q-002/Q-003/Q-004: new repo here, no deviation needed.
- Q-005: libs/boilerplate/AI code all allowed; list in README.
- Q-006: 1-Click JWT not required (register at https://partners.near-intents.org for lower fee; without JWT +0.2-0.25% fee).
- Q-007: **no Intents testnet** — mainnet, tiny amounts, dry:true quotes. Confirmed by docs ("no testnet version of NEAR Intents").
- Q-008: testnet NEAR free (near-cli faucet / near-faucet.io); mainnet not reimbursed.
- Q-009: public RPC free: https://docs.near.org/api/rpc/providers. Testnet verified 2026-11-08: https://rpc.testnet.near.org (protocol_version 88, height ~276.8M). Mainnet provider list in DECISIONS D-011.
- Q-010: testnet-only projects eligible (all tracks; mainnet only where integration is mainnet-only — our cross-chain is, so mainnet micro-amounts needed for Gate 7).
- Q-011: no mandatory integration; own NEAR contract suffices. We lean on function-call keys, locked accounts, NEAR Intents — must name them in README.
- Q-012: local-only demo is acceptable (public repo + reproducible README + X **video**; screenshots alone insufficient). Hosted demo is a plus; keep up through 2026-11-18 ideally 2026-11-25. → deploy web/API (Phase 8).
- Q-013/Q-014: team keeps code rights; any license OK (MIT fine — add LICENSE in Phase 8); repo public through judging.
- Q-015: one person ≤2 independent projects, disclosed in each README.
- Q-016: single payout ≤30 days after results. Q-017: Claude Code/Codex screen (reproducibility, feature verification); humans decide.
- Q-000: NEAR AI credits via https://cloud.near.ai (only needed for optional LLM scenario; scripted mode is the judge path).

## README expectations (judge-facing)
Machine + human readable: product, problem, "do X — see Y" steps with exact expected outputs (spec §12.1 skeleton 8 sections). No marketing. List libraries/templates/AI code. Disclose any pre-existing product on another chain (none — fresh repo). Mention: function-call keys, locked account, sub-accounts, NEAR Intents 1-Click, (if done) global contracts/Shade Agents.

## Demo post (human publishes; we draft only)
Must say built at NEAR HACKATHON, tag @NEARProtocol + #NEARHackathon (opt @NearLegion, @NearBuilders), attach demo video or screenshots, lead with user problem, show one real action→result, explain NEAR's concrete role, give next step (repo link). Video ≤3 min per spec §12.2.

## Partner docs (verified 2026-11-08)
- NEAR Intents 1-Click: https://docs.near-intents.org/ — base https://1click.chaindefuser.com, OpenAPI v0.1.10 at /docs/v0/openapi.yaml. Auth X-API-Key or Authorization: Bearer (partner JWT); unauthenticated +0.25% fee. Quote/status/deposit-submit flows + statuses → DECISIONS D-008/D-009.
- NEAR docs: https://docs.near.org/ (+ llms.txt). Quickstart versions (rustc 1.86, near-cli 0.22, cargo-near 0.16.1 at write time) are stale; we use current: rustc 1.99.1, cargo-near 0.23.0, near-cli-rs 0.31.1, near-sdk 5.30.1 (see DECISIONS).
- Ecosystem table (Intents, Aurora, Trezu, SputnikDAO, OutLayer, NEAR.AI…) in HACKATHON.md §Ecosystem — only Intents is used by AgentVault; no conflicting requirements.

## Deviations from spec (spec vs HACKATHON.md)
1. D-001: Hub for submission is POST API + /#apply form, not email — affects Phase 9 checklist only. Recorded in DECISIONS.md.
2. D-002: Spec assumed JWT maybe required; HACKATHON.md Q-006 + docs confirm optional (0.2-0.25% fee without). Affects executor fee logging only.
3. D-003: Spec README skeleton (§12.1) conforms to HACKATHON.md "do X — see Y"; confirmed no conflict. AI-screening (Q-017) reinforces exact-output requirement (Phase 8 fresh-clone dry run).
