import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, subscribeStream } from "../lib/api";
import { Empty, ErrorState, Loading } from "../components/states";
import { PolicyEditor } from "./NewVault";

interface AgentRow {
  name: string;
  status: string;
  violations: number;
}

export default function Agents() {
  const { vaultId } = useParams();
  const [agents, setAgents] = useState<Array<[string, AgentRow]>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const [policyJson, setPolicyJson] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const load = () =>
    api<Array<[string, AgentRow]>>(`/vaults/${vaultId}/agents`)
      .then((d) => {
        setAgents(Array.isArray(d) ? d : []);
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
      if (t === "agent.updated" || t === "request.created") void load();
    });
    return unsub;
  }, [vaultId]);

  if (!vaultId) return <Empty title="Pick a vault" />;
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (agents.length === 0) return <Empty title="No agents yet" />;

  return (
    <div>
      <h1 className="display text-2xl">Agents</h1>
      <ul className="mt-4 space-y-3">
        {agents.map(([pk, a]) => (
          <li key={pk} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{a.name}</span>
              <span className="chip" style={{ color: a.status === "Active" ? "var(--green)" : a.status === "Frozen" ? "var(--amber)" : "#6b7280" }}>
                ● {a.status}
              </span>
              <span className="row-mono text-xs text-[#98a2b3]">{pk}</span>
              <span className="ml-auto flex gap-2">
                {a.status === "Active" ? (
                  <button className="rounded border border-[#262c38] px-3 py-1" onClick={() => setEditing(editing === pk ? null : pk)}>
                    Edit policy
                  </button>
                ) : null}
                <button className="rounded border border-[#e26a6a] px-3 py-1 text-[#e26a6a]" onClick={() => setConfirm(pk)}>
                  Revoke key
                </button>
              </span>
            </div>
            {confirm === pk ? (
              <div className="mt-3 rounded border border-[#e26a6a] p-3">
                <p className="text-sm">Type <b>{a.name}</b> to confirm. This deletes the agent's access key on-chain. The agent will immediately lose the ability to submit requests. This cannot be undone.</p>
                <input className="mt-2 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" placeholder={`Type ${a.name}`} onChange={(e) => {
                  if (e.target.value === a.name) {
                    setConfirm("");
                    setEditing(null);
                  }
                }} />
              </div>
            ) : null}
            {editing === pk ? (
              <div className="mt-3">
                <PolicyEditor value={policyJson} onChange={setPolicyJson} />
                <p className="mt-2 text-xs text-[#98a2b3]">Save signs a wallet transaction (update_policy).</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
