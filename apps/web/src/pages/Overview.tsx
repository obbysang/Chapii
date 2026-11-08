import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, humanAmount, subscribeStream } from "../lib/api";
import { ErrorState, Loading, statusColor, Empty } from "../components/states";
import { REASON_MESSAGES } from "@agentvault/shared";

interface Req {
  onchainId: string;
  clientRef: string;
  asset: string;
  amount: string;
  chain: string;
  address: string;
  status: string;
  reason: string | null;
  memo: string | null;
  createdAt: string;
}

export function Feed({ vaultId }: { vaultId: string }) {
  const [rows, setRows] = useState<Req[]>([]);
  const [error, setError] = useState("");
  const [live, setLive] = useState(true);

  const load = () =>
    api<{ rows: Req[] }>(`/vaults/${vaultId}/requests?limit=20`)
      .then((d) => setRows(d.rows))
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    const unsub = subscribeStream(vaultId, (type) => {
      if (type === "request.created" || type === "request.updated") void load();
    });
    const t = setInterval(() => void load(), 6000);
    return () => {
      unsub();
      clearInterval(t);
    };
  
  }, [vaultId]);

  if (error) return <ErrorState message={error} retry={load} />;
  if (rows.length === 0) return <Empty title="No requests yet" />;

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs text-[#98a2b3]">
        <span aria-hidden>{live ? "●" : "○"}</span> {live ? "Live (SSE + 6s refresh)" : "paused"}
        <button className="underline" onClick={() => setLive(!live)}>{live ? "pause" : "resume"}</button>
      </p>
      <ul className="divide-y divide-[#262c38]">
        {rows.map((r) => (
          <li key={r.onchainId}>
            <Link to={`/v/${vaultId}/requests/${r.onchainId}`} className="flex flex-wrap items-center gap-3 py-2">
              <span className="chip" style={{ color: statusColor(r.status) }}>● {r.status}</span>
              <span className="font-medium">{humanAmount(r.amount)} {r.asset}</span>
              <span className="row-mono text-[#98a2b3]">→ {r.address.length > 20 ? `${r.address.slice(0, 10)}…${r.address.slice(-6)}` : r.address}</span>
              <span className="text-xs text-[#98a2b3]">{r.clientRef}</span>
              {r.reason ? (
                <span className="text-xs text-[#e26a6a]" title={(REASON_MESSAGES as Record<string, { message: string }>)[r.reason]?.message}>
                  {r.reason}
                </span>
              ) : null}
              <time className="ml-auto text-xs text-[#98a2b3]">{new Date(r.createdAt).toLocaleTimeString()}</time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Overview() {
  const { vaultId } = useParams();
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vaultId) return;
    api<Record<string, unknown>>(`/vaults/${vaultId}/summary`).then(setSummary).catch((e: Error) => setError(e.message));
  }, [vaultId]);

  if (!vaultId) return <Empty title="Pick a vault" />;
  if (error) return <ErrorState message={error} />;
  if (!summary) return <Loading />;

  const cards = [
    ["Approved", String(summary.approved ?? 0), "var(--green)"],
    ["Rejected", String(summary.rejected ?? 0), "var(--red)"],
    ["Spent (yocto)", String(summary.spent ?? "0"), "var(--amber)"],
    ["Requests", String(summary.requests ?? 0), "var(--blue)"],
  ];
  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview <span className="row-mono text-sm text-[#98a2b3]">{vaultId}</span></h1>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {cards.map(([k, v, c]) => (
          <div key={k} className="rounded-lg border border-[#262c38] bg-[#151920] p-4">
            <p className="text-xs text-[#98a2b3]">{k}</p>
            <p className="text-xl" style={{ color: c }}>{v}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-lg font-semibold">Live feed</h2>
      <Feed vaultId={vaultId} />
    </div>
  );
}
