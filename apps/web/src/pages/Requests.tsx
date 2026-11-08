import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, humanAmount } from "../lib/api";
import { Empty, ErrorState, Loading } from "../components/states";

export function Requests() {
  const { vaultId } = useParams();
  const [rows, setRows] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = () =>
    api<{ rows: unknown[] }>(`/vaults/${vaultId}/requests?limit=50${status ? `&status=${status}` : ""}`)
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
  
  }, [vaultId, status]);

  if (!vaultId) return <Empty title="Pick a vault" />;
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={load} />;

  return (
    <div>
      <h1 className="display text-2xl">Requests</h1>
      <div className="mt-3 flex gap-2">
        {["", "COMPLETED", "REJECTED", "PENDING_APPROVAL", "FAILED", "AWITING_EXECUTION"].map((s) => (
          <button key={s} className={`rounded border px-3 py-1 text-sm ${status === s ? "border-[#3fb68b]" : "border-[#262c38]"}`} onClick={() => setStatus(s)}>
            {s || "All"}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="No requests in this state" />
      ) : (
        <ul className="mt-4 divide-y divide-[#262c38]">
          {(rows as Array<Record<string, unknown>>).map((r) => (
            <li key={String(r.onchainId)} className="flex flex-wrap gap-3 py-2 text-sm">
              <span className="font-medium">{humanAmount(String(r.amount))} {String(r.asset)}</span>
              <span className="chip">{String(r.status)}</span>
              <span className="row-mono">{String(r.address).slice(0, 18)}</span>
              <span className="text-[#98a2b3]">{String(r.reason ?? "")}</span>
              <span className="ml-auto text-xs text-[#98a2b3]">{String(r.clientRef)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RequestDetail() {
  const { vaultId, requestId } = useParams();
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Record<string, unknown>>(`/vaults/${vaultId}/requests/${requestId}`).then(setRow).catch((e: Error) => setError(e.message));
  }, [vaultId, requestId]);
  if (error) return <ErrorState message={error} />;
  if (!row) return <Loading />;
  return (
    <div>
      <h1 className="display text-2xl">Request #{requestId}</h1>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        {[["Status", r("status")], ["Reason", r("reason")], ["Amount", `${humanAmount(String(r("amount")))} ${String(r("asset"))}`], ["Payee", r("address")], ["Chain", r("chain")], ["Memo (untrusted)", r("memo")]].map(([k, v]) => (
          <div key={k} className="rounded border border-[#262c38] bg-[#151920] p-3">
            <dt className="text-xs text-[#98a2b3]">{k}</dt>
            <dd>{String(v ?? "—")}</dd>
          </div>
        ))}
      </dl>
      <pre className="mt-4 rounded bg-black p-3 text-xs">{JSON.stringify(row, null, 2)}</pre>
    </div>
  );
  function r(k: string): string {
    return String(row?.[k] ?? "");
  }
}
