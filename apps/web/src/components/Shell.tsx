import { Link, NavLink, Outlet } from "react-router-dom";
import { NETWORK } from "../lib/api";
import { useWallet } from "../lib/wallet";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

function VaultStatusChip({ vaultId }: { vaultId: string }) {
  const [paused, setPaused] = useState<boolean | null>(null);
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const rpc = NETWORK === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com";
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "query",
            params: {
              request_type: "call_function",
              account_id: vaultId,
              method_name: "is_paused",
              args_base64: "e30=",
              finality: "final",
            },
          }),
        });
        const json = (await res.json()) as { result: { result: number[] } };
        if (!stop) setPaused(new TextDecoder().decode(new Uint8Array(json.result.result)) === "true");
      } catch {
        /* offline */
      }
    };
    void poll();
    const t = setInterval(poll, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [vaultId]);
  if (paused === null) return null;
  return (
    <span className="chip" style={{ color: paused ? "var(--red)" : "var(--green)" }}>
      {paused ? "● PAUSED" : "● ACTIVE"}
    </span>
  );
}

export default function Shell() {
  const { account, connect } = useWallet();
  const [vaultIds, setVaultIds] = useState<string[]>([]);
  useEffect(() => {
    if (!account) return;
    api<{ rows?: unknown }>(`/vaults`).then(
      () => undefined,
      () => undefined
    );
    setVaultIds([]);
  }, [account]);
  const vaultId = vaultIds[0] ?? "";

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#262c38]">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            AgentVault
          </Link>
          <span className="chip" style={{ color: NETWORK === "mainnet" ? "var(--red)" : "var(--amber)" }}>
            {NETWORK.toUpperCase()}
          </span>
          {vaultId ? <VaultStatusChip vaultId={vaultId} /> : null}
          <div className="ml-auto flex items-center gap-3">
            <Link className="text-sm text-[#98a2b3]" to="/demo">
              Live demo
            </Link>
            {account ? (
              <span className="chip" title={account}>
                {account.length > 18 ? `${account.slice(0, 10)}…${account.slice(-6)}` : account}
              </span>
            ) : (
              <button className="rounded border border-[#262c38] px-4 py-2" onClick={connect} aria-label="Connect wallet">
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <nav className="hidden w-48 shrink-0 md:block" aria-label="Primary">
          <ul className="space-y-1 text-sm">
            {([
              ["/", "Home"],
              ["/new", "Create vault"],
              ["/demo", "Demo"],
              [vaultId ? `/v/${vaultId}` : "/demo", "Overview"],
              [vaultId ? `/v/${vaultId}/agents` : "/demo", "Agents"],
              [vaultId ? `/v/${vaultId}/requests` : "/demo", "Requests"],
              [vaultId ? `/v/${vaultId}/approvals` : "/demo", "Approvals"],
              [vaultId ? `/v/${vaultId}/fund` : "/demo", "Fund"],
              [vaultId ? `/v/${vaultId}/security` : "/demo", "Security"],
            ] as Array<[string, string]>).map(([to, label]) => (
              <li key={to + label}>
                <NavLink to={to} className={({ isActive }) => `block rounded px-3 py-2 ${isActive ? "bg-[#151920]" : ""}`}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
