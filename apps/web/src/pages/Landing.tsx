import { Link } from "react-router-dom";
import { DEMO_VAULT, NETWORK } from "../lib/api";

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="display text-5xl leading-[1.05] md:text-7xl">
          Give your AI agent a wallet it can't abuse.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[var(--muted)]">
          AgentVault enforces spending rules on-chain. Even a hijacked agent can't exceed them — policy lives in a
          NEAR contract, not in the agent process.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-sm text-right">
        <span className="mb-1 block text-xs">Built for</span>
        <span className="mb-3 block text-xs">NEAR HACKATHON 2026</span>
        <p className="text-sm font-medium">
          <span className="block">A policy-enforced treasury on NEAR for AI agents</span>
          <span className="block">that spend money — with protocol-level key restrictions,</span>
          <span className="block">on-chain caps, and an auto-freeze circuit breaker.</span>
        </p>
      </div>

      <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link className="pill" to={`/v/${DEMO_VAULT}`}>
          <span>Open live demo</span>
          <span className="pill-arrow" aria-hidden>↗</span>
        </Link>
        <Link className="pill" to="/new">
          <span>Create vault</span>
          <span className="pill-arrow" aria-hidden>↗</span>
        </Link>
        <Link className="pill" to={`/v/${DEMO_VAULT}/security`}>
          <span>See the attack suite</span>
          <span className="pill-arrow" aria-hidden>↗</span>
        </Link>
      </div>

      <div className="relative mt-10 flex items-center justify-center">
        <div className="spin-badge absolute right-10 top-0 hidden md:block">
          <svg className="spin-ring" width="160" height="160" viewBox="0 0 100 100" aria-hidden>
            <defs><path id="circ" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" /></defs>
            <text fontSize="8.2" letterSpacing="2"><textPath href="#circ">AGENTVAULT • AI SECURITY &amp; DEFENSE • NEAR HACKATHON •</textPath></text>
          </svg>
          <span className="absolute inset-0 grid place-items-center text-3xl" aria-hidden>↗</span>
        </div>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-4">
        {[
          ["1 · Protocol key", "Function-call keys restrict the agent to one method at the protocol level"],
          ["2 · Contract policy", "Allowlist, caps, rate limits, co-sign — evaluated on-chain, then approved or rejected with a reason"],
          ["3 · Circuit breaker", "Repeated violations auto-freeze the agent in the same contract call"],
          ["4 · Owner controls", "One-click freeze/revoke; chain is the source of truth"],
        ].map(entry => {
          const t = entry[0] ?? "";
          const d = entry[1] ?? "";
          const i = Number(t.slice(0, 1));
          return (
          <div key={t} className="rounded-2xl border border-[var(--line)] bg-white p-6">
            <p className="display text-2xl">{i + 1}</p>
            <p className="mt-2 font-medium">{t.replace(/^[0-9] · /, "")}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{d}</p>
          </div>
          );
        })}
      </div>

      <p className="mt-10 text-xs text-[var(--muted)]">
        Network: {NETWORK}. Demo vault {DEMO_VAULT} is public and read-only; owner actions need the owner wallet.
      </p>
    </div>
  );
}
