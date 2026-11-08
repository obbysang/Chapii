import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, subscribeStream } from "../lib/api";
import { Empty, Loading, ErrorState } from "../components/states";

export function Approvals() {
  const { vaultId } = useParams();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () =>
    api<{ rows: Array<Record<string, unknown>> }>(`/vaults/${vaultId}/requests?status=PENDING_APPROVAL&limit=50`)
      .then((d) => {
        setRows(d.rows ?? []);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });

  useEffect(() => {
    void load();
    if (!vaultId) return;
    const unsub = subscribeStream(vaultId, (t) => {
      if (t.startsWith("request")) void load();
    });
    return unsub;
  }, [vaultId]);

  if (!vaultId) return <Empty title="Pick a vault" />;
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (rows.length === 0) return <Empty title="No pending approvals" />;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Approvals</h1>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={String(r.onchainId)} className="rounded-lg border border-[#262c38] bg-[#151920] p-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="font-medium">{String(r.amount)} {String(r.asset)}</span>
              <span className="row-mono">→ {String(r.address)}</span>
              <span className="text-[#98a2b3]">{String(r.memo ?? "")}</span>
              <span className="ml-auto flex gap-2">
                <button className="rounded bg-[#3fb68b] px-3 py-1 font-medium text-black">Approve</button>
                <button className="rounded border border-[#e26a6a] px-3 py-1 text-[#e26a6a]">Reject</button>
              </span>
            </div>
            <p className="mt-1 text-xs text-[#98a2b3]">Request #{String(r.onchainId)} · approves / rejects via owner wallet transaction (approve_request / reject_request).</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Security() {
  const { vaultId } = useParams();
  const [report, setReport] = useState<{ results?: Array<Record<string, unknown>> } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    api<{ results?: Array<Record<string, unknown>> }>(`/harness/runs/latest?vaultId=${vaultId}`).then(setReport).catch(() => undefined);
  }, [vaultId]);

  async function runSuite(): Promise<void> {
    setRunning(true);
    setProgress("Starting…");
    try {
      const { runId } = await api<{ runId: string }>(`/harness/runs`, { method: "POST", body: JSON.stringify({ vaultId }) });
      const poll = async (): Promise<void> => {
        const s = await api<{ status: string; total: number; passed: number }>(`/harness/runs/${runId}`);
        setProgress(`${s.status}: ${s.passed}/${s.total}`);
        if (s.status === "DONE" || s.status === "ERROR") {
          setRunning(false);
          setReport(await api<{ results?: Array<Record<string, unknown>> }>(`/harness/runs/latest?vaultId=${vaultId}`));
        } else {
          setTimeout(() => void poll(), 2000);
        }
      };
      void poll();
    } catch (e) {
      setProgress("Harness unavailable on this deployment. Run `pnpm harness --network testnet` locally.");
    }
  }

  const results = report?.results ?? [];
  const passed = results.filter((r) => r.passed).length;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Security</h1>
      <p className="mt-2 text-sm text-[#98a2b3]">Red-team harness report ({results.length ? `${passed}/${results.length} contained` : "no run yet"}).</p>
      {vaultId ? (
        <button className="mt-3 rounded bg-[#3fb68b] px-4 py-2 font-medium text-black disabled:opacity-40" disabled={running} onClick={() => void runSuite()}>
          {running ? `Running… ${progress}` : "Run attack suite"}
        </button>
      ) : null}
      {running ? <p className="mt-2 text-xs">{progress}</p> : null}
      {results.length === 0 ? (
        <Empty title="No harness report yet" />
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#98a2b3]">
              <th className="py-1 pr-2">ID</th>
              <th className="py-1 pr-2">Category</th>
              <th className="py-1 pr-2">Scenario</th>
              <th className="py-1 pr-2">Expected</th>
              <th className="py-1 pr-2">Actual</th>
              <th className="py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-t border-[#262c38]">
                <td className="py-2 pr-2">{String(r.scenarioId)}</td>
                <td className="py-2 pr-2">{String(r.category)}</td>
                <td className="py-2 pr-2">{String(r.title)}</td>
                <td className="py-2 pr-2">{String(r.expected)}</td>
                <td className="py-2 pr-2">{String(r.actual)}</td>
                <td className="py-2" style={{ color: r.passed ? "var(--green)" : "var(--red)" }}>{r.passed ? "✅" : "❌"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Fund() {
  const { vaultId } = useParams();
  const [addr, setAddr] = useState<string | null>(null);
  const [quote, setQuote] = useState("");
  useEffect(() => {
    if (vaultId) setAddr(vaultId);
  }, [vaultId]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Fund</h1>
      <div className="mt-4 flex gap-2">
        <button className="rounded border border-[#262c38] px-3 py-1">Direct</button>
        <button className="rounded border border-[#262c38] px-3 py-1">From another chain (Intents, P1)</button>
      </div>
      <p className="mt-3 rounded bg-[#151920] p-3 text-sm">Deposit address: <span className="row-mono">{addr}</span></p>
      <label className="mt-3 block text-sm">Quote amount (small units)
        <input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="1000000000000000000000000" />
      </label>
      <p className="mt-2 text-xs text-[#98a2b3]">Intents fund-quote proxies the 1-Click API. Cross-chain payout destinations are verified off-chain (honest limitation, see Security).</p>
    </div>
  );
}

export function SettingsPage() {
  const { vaultId } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-[#98a2b3]">Vault {vaultId}</p>
      <div className="mt-4 space-y-2">
        <button className="rounded border border-[#e26a6a] px-4 py-2 text-[#e26a6a]">Pause vault</button>
        <button className="rounded border border-[#262c38] px-4 py-2">Set executor</button>
        <button className="rounded border border-[#262c38] px-4 py-2">Withdraw NEAR</button>
      </div>
    </div>
  );
}
