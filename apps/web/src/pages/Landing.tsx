import { Link } from "react-router-dom";
import { DEMO_VAULT, NETWORK } from "../lib/api";

export default function Landing() {
  return (
    <div>
      <h1 className="text-4xl font-bold leading-tight">Give your AI agent a wallet it can't abuse.</h1>
      <p className="mt-3 max-w-2xl text-[#98a2b3]">
        AgentVault enforces spending rules on-chain. Even a hijacked agent can't exceed them — policy lives in a
        NEAR contract, not in the agent process.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/v/${DEMO_VAULT}`} className="rounded bg-[#3fb68b] px-5 py-3 font-medium text-black">
          Open live demo
        </Link>
        <Link to="/new" className="rounded border border-[#262c38] px-5 py-3">
          Create vault
        </Link>
        <Link to={`/v/${DEMO_VAULT}/security`} className="rounded border border-[#262c38] px-5 py-3">
          See the attack suite
        </Link>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          ["1 · Protocol key", "Function-call keys restrict the agent to one method at the protocol level"],
          ["2 · Contract policy", "Allowlist, caps, rate limits, co-sign — evaluated on-chain"],
          ["3 · Circuit breaker", "Repeated violations auto-freeze the agent"],
          ["4 · Owner controls", "One-click freeze/revoke; chain is the source of truth"],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-[#262c38] bg-[#151920] p-4">
            <p className="font-medium">{t}</p>
            <p className="mt-1 text-sm text-[#98a2b3]">{d}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-[#98a2b3]">
        Network: {NETWORK}. Demo vault {DEMO_VAULT} is public and read-only; owner actions need the owner wallet.
      </p>
    </div>
  );
}
