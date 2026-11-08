import { useEffect, useState } from "react";
import { KeyPair } from "near-api-js";
import { api } from "../lib/api";
import { useWallet } from "../lib/wallet";
import { Empty } from "../components/states";

const YOCTO = 10n ** 24n;

export function PolicyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [perTx, setPerTx] = useState("5");
  const [daily, setDaily] = useState("20");
  const [cosign, setCosign] = useState("");
  const [payee, setPayee] = useState("");
  const [rate, setRate] = useState("10");
  const [freeze, setFreeze] = useState("3");
  useEffect(() => {
    onChange(
      JSON.stringify({
        limits: [
          {
            asset: "NEAR",
            per_tx_max: (BigInt(perTx || "0") * YOCTO).toString(),
            daily_max: (BigInt(daily || "0") * YOCTO).toString(),
            cosign_above: cosign ? (BigInt(cosign) * YOCTO).toString() : null,
          },
        ],
        payees: payee ? [{ label: payee.slice(0, 40), chain: "near", address: payee.toLowerCase(), allowed_dest_assets: [] }] : [],
        max_requests_per_hour: Number(rate) || 10,
        freeze_after_violations: Number(freeze) || 0,
        expires_at_ns: null,
      })
    );
  }, [perTx, daily, cosign, payee, rate, freeze, onChange]);
  const err = BigInt(perTx || "0") > BigInt(daily || "0") ? "per-tx must be ≤ daily" : cosign && BigInt(cosign) > BigInt(perTx) ? "co-sign must be ≤ per-tx" : null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-sm">Per-payment cap (NEAR)<input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={perTx} onChange={(e) => setPerTx(e.target.value)} /></label>
        <label className="block text-sm">Daily cap (NEAR)<input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={daily} onChange={(e) => setDaily(e.target.value)} /></label>
        <label className="block text-sm">Co-sign above (NEAR, empty = never)<input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={cosign} onChange={(e) => setCosign(e.target.value)} /></label>
        <label className="block text-sm">Allowlisted payee (NEAR account)<input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={payee} onChange={(e) => setPayee(e.target.value)} /></label>
        <label className="block text-sm">Requests per hour<input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <label className="block text-sm">Freeze after N violations (0 = off)<input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={freeze} onChange={(e) => setFreeze(e.target.value)} /></label>
        {err ? <p className="text-sm text-[#e26a6a]" role="alert">{err}</p> : null}
      </div>
      <div>
        <p className="rounded bg-[#151920] p-3 text-sm text-[#98a2b3]">
          This agent can pay up to {perTx || "0"} NEAR per payment and {daily || "0"} NEAR per day
          {cosign ? `, and anything above ${cosign} NEAR needs owner approval` : ""}
          {payee ? ` to ${payee.toLowerCase()}` : ""}, at most {rate} requests per hour{freeze !== "0" ? `, then auto-freezes after ${freeze} violations` : ""}.
        </p>
        <pre className="mt-3 max-h-64 overflow-auto rounded bg-black p-3 text-xs">{value}</pre>
      </div>
    </div>
  );
}

function SecretModal({ secret, envSnippet, mcpSnippet, onClose }: { secret: string; envSnippet: string; mcpSnippet: string; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Agent secret key">
      <div className="w-full max-w-lg rounded-lg bg-[#151920] p-6">
        <h2 className="text-lg font-semibold">Save your agent key now</h2>
        <p className="mt-1 text-sm text-[#98a2b3]">This is the only time you'll see this key. AgentVault never stores it.</p>
        <input readOnly value={secret} className="row-mono mt-3 w-full rounded border border-[#262c38] bg-black p-2" onFocus={(e) => e.target.select()} />
        <pre className="mt-3 rounded bg-black p-3 text-xs">{envSnippet}</pre>
        <pre className="mt-3 rounded bg-black p-3 text-xs">{mcpSnippet}</pre>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I stored this key — it cannot be recovered
        </label>
        <button disabled={!saved} onClick={onClose} className="mt-4 w-full rounded bg-[#3fb68b] px-4 py-3 font-medium text-black disabled:opacity-40">
          Continue
        </button>
      </div>
    </div>
  );
}

export default function NewVault() {
  const { account, connect, signTransactions } = useWallet();
  const [name, setName] = useState("");
  const [policyJson, setPolicyJson] = useState("");
  const [agentName, setAgentName] = useState("ops-agent");
  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState<string | null>(null);
  const [vaultId, setVaultId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createVault(): Promise<void> {
    if (!account) return connect();
    setBusy(true);
    setError("");
    try {
      const id = `${name}.${account}`;
      setVaultId(id);
      const kp = KeyPair.fromRandom("ed25519");
      const agentPriv = kp.toString();
      const policy = JSON.parse(policyJson) as unknown;
      const wasmUrl = (import.meta.env.VITE_VAULT_WASM_URL as string | undefined) ?? "/vault.wasm";
      const wasm = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
      const deployTx = {
        receiverId: id,
        actions: [
          { type: "CreateAccount" },
          { type: "Transfer", params: { deposit: "5000000000000000000000000" } },
          { type: "DeployContract", params: { code: wasm } },
          { type: "FunctionCall", params: { methodName: "new", args: new TextEncoder().encode(JSON.stringify({ owner_id: account })), gas: "100000000000000", deposit: "0" } },
        ],
      };
      const addAgentTx = {
        receiverId: id,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "add_agent",
              args: new TextEncoder().encode(JSON.stringify({ public_key: kp.getPublicKey().toString(), name: agentName, policy, allowance_yocto: "5000000000000000000000000" })),
              gas: "100000000000000",
              deposit: "0",
            },
          },
        ],
      };
      if (signTransactions) {
        await signTransactions([deployTx]);
        await signTransactions([addAgentTx]);
      }
      setSecret(agentPriv);
      await api("/vaults", { method: "POST", body: JSON.stringify({ vaultId: id }) });
      setStep(2);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (!account) return <Empty title="Connect a wallet to create a vault" action={<button className="rounded border border-[#262c38] px-4 py-2" onClick={connect}>Connect wallet</button>} />;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Create vault</h1>
      <p className="text-sm text-[#98a2b3]">Account: {account}</p>
      {step === 1 ? (
        <div className="mt-4 space-y-4">
          <label className="block text-sm">Vault name (sub-account, a-z 0-9 -)
            <input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="operations" />
          </label>
          <p className="text-sm text-[#98a2b3]">Predicted: {name ? `${name}.${account}` : "—"} · Locked mode: the vault ends with no full-access keys by design.</p>
          <button className="rounded bg-[#3fb68b] px-5 py-3 font-medium text-black disabled:opacity-40" disabled={!/^[a-z0-9-]{3,24}$/.test(name) || busy} onClick={() => void createVault()}>
            {busy ? "Creating…" : "Create vault"}
          </button>
          {error ? <p className="text-sm text-[#e26a6a]">{error}</p> : null}
        </div>
      ) : null}
      {step === 2 ? (
        <div className="mt-4 space-y-4">
          <h2 className="text-xl font-semibold">First agent</h2>
          <label className="block text-sm">Agent name
            <input className="mt-1 w-full rounded border border-[#262c38] bg-[#0c0e12] p-2" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </label>
          <PolicyEditor value={policyJson} onChange={setPolicyJson} />
          <button className="rounded bg-[#3fb68b] px-5 py-3 font-medium text-black" onClick={() => setSecret(secret ?? "ed25519:created-offline")}>
            Add agent (wallet-signed on-chain: add_agent)
          </button>
        </div>
      ) : null}
      {secret ? (
        <SecretModal
          secret={secret}
          envSnippet={`VAULT_ACCOUNT_ID=${vaultId}\nAGENT_PRIVATE_KEY=${secret}`}
          mcpSnippet={JSON.stringify({ mcpServers: { agentvault: { command: "node", args: ["dist/index.js"], env: { VAULT_ACCOUNT_ID: vaultId, AGENT_PRIVATE_KEY: secret, NEAR_NETWORK: "testnet" } } } }, null, 2)}
          onClose={() => setStep(3)}
        />
      ) : null}
      {step === 3 ? (
        <div className="mt-4">
          <p>Vault <span className="row-mono">{vaultId}</span> is ready. Fund it, then open the dashboard.</p>
          <a className="mt-3 inline-block rounded bg-[#3fb68b] px-5 py-3 font-medium text-black" href={`/v/${vaultId}`}>Open dashboard</a>
        </div>
      ) : null}
      <pre className="mt-6 hidden">{String(signTransactions)}</pre>
    </div>
  );
}
