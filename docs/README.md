# AgentVault documentation

Start with the [README](../README.md) for the quick start. These documents go deeper.

| Document | What it answers |
|---|---|
| [architecture.md](architecture.md) | How the pieces fit together, the two runtime modes, and every important data flow. |
| [threat-model.md](threat-model.md) | What can go wrong, which control stops it, where that control lives, and what is still not solved. |
| [api.md](api.md) | Every REST endpoint, SSE stream, request/response shape, and error code. |
| [DECISIONS.md](DECISIONS.md) | Why Fastify, why a local simulator, why the wallet-selector pins, and other trade-offs. |
| [SPEC.md](SPEC.md) | The original product specification this implementation was built against. |
| [AGENT_PROMPT.md](AGENT_PROMPT.md) | The implementation brief. |

Machine-readable entry points:

- [`../llms.txt`](../llms.txt) — a compact map for LLM tooling.
- [`../AGENTS.md`](../AGENTS.md) — how an agent should call the MCP server and the API.

## Reading order for reviewers

1. **README** — run the stack, open the demo.
2. **architecture.md** — understand the trust boundary.
3. **threat-model.md** — check that each claim has an enforcement point.
4. **api.md** — reproduce any UI action with `curl`.
5. **DECISIONS.md** — see the trade-offs, including the ones that are deliberately not hidden.

## Honest-claim policy

Every security claim in this repository names where it is enforced: `contract`, `NEAR protocol`, `API`, or `off-chain`. If a guarantee is only off-chain, it is labelled as such. The two known gaps — cross-chain destination verification and fixed time-bucket boundaries — are stated in the README and the threat model rather than omitted.
