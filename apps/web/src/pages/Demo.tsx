import { Link, useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { DEMO_VAULT } from "../lib/api";

export default function Demo() {
  const navigate = useNavigate();
  return (
    <>
    <TopNav />
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="display text-4xl">Live demo</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Read-only public vault {DEMO_VAULT} on testnet with real activity. No wallet needed. The feed shows green
        (approved) and red (blocked) rows from the red-team harness.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link className="pill" to={`/v/${DEMO_VAULT}`}>
          Open the dashboard
        </Link>
        <button
          className="pill"
          onClick={() => navigate(`/v/${DEMO_VAULT}/security`)}
        >
          Run attack suite
        </button>
      </div>
      <p className="mt-4 text-xs text-[#98a2b3]">“Run attack suite” starts a harness run against the demo vault; the report streams here.</p>
    </div>
    </>
  );
}
