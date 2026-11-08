import { Link, useNavigate } from "react-router-dom";
import { DEMO_VAULT } from "../lib/api";

export default function Demo() {
  const navigate = useNavigate();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Live demo</h1>
      <p className="mt-2 max-w-2xl text-[#98a2b3]">
        Read-only public vault {DEMO_VAULT} on testnet with real activity. No wallet needed. The feed shows green
        (approved) and red (blocked) rows from the red-team harness.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link className="rounded bg-[#3fb68b] px-5 py-3 font-medium text-black" to={`/v/${DEMO_VAULT}`}>
          Open the dashboard
        </Link>
        <button
          className="rounded border border-[#262c38] px-5 py-3"
          onClick={() => navigate(`/v/${DEMO_VAULT}/security`)}
        >
          Run attack suite
        </button>
      </div>
      <p className="mt-4 text-xs text-[#98a2b3]">“Run attack suite” starts a harness run against the demo vault; the report streams here.</p>
    </div>
  );
}
