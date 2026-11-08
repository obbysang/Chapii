import { Link, NavLink, Outlet } from "react-router-dom";
import { NETWORK } from "../lib/api";
import { useWallet } from "../lib/wallet";
import { useEffect, useState } from "react";

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
  const [vaultIds] = useState<string[]>([]);
  const vaultId = vaultIds[0] ?? "";

  return (
    <div className="min-h-screen">
      <nav>
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-24 items-center">
            <Link className="inline-block text-xl font-semibold tracking-tight" to="/">
              agentvault
            </Link>
            <span className="ml-2 chip" style={{ color: NETWORK === "mainnet" ? "var(--red)" : "var(--amber)" }}>
              {NETWORK.toUpperCase()}
            </span>
            <div className="ml-auto flex items-center">
              {[
                ["/", "About"],
                ["/demo", "Live demo"],
                ["/new", "Create vault"],
              ].map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => `mr-8 inline-block hover:underline ${isActive ? "underline" : ""}`}>
                  {label}
                </NavLink>
              ))}
            </div>
            {account ? (
              <span className="chip" title={account}>
                {account.length > 18 ? `${account.slice(0, 10)}…${account.slice(-6)}` : account}
              </span>
            ) : (
              <button className="pill" onClick={connect} aria-label="Connect wallet">
                <span>Connect wallet</span>
                <span className="pill-arrow" aria-hidden>↗</span>
              </button>
            )}
          </div>
        </div>
      </nav>
      <div className="mx-auto flex max-w-7xl items-start gap-4 px-4">
        <main className="min-w-0 flex-1 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function VaultStatusChipExport({ vaultId }: { vaultId: string }) {
  return <VaultStatusChip vaultId={vaultId} />;
}
