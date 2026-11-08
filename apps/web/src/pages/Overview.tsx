import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  DollarSign,
  Users,
  FileText,
  Shield,
  TrendingUp,
  Activity,
  Bell,
  KeyRound,
  Ban,
} from "lucide-react";
import { api, humanAmount, subscribeStream } from "../lib/api";
import { Card } from "../components/ui/ui";

const NEAR = 10n ** 24n;

function StatCard({ title, value, delta, Icon, tint }: { title: string; value: string; delta: string; Icon: LucideIcon; tint: string }) {
  return (
    <Card className="p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <div className={`rounded-lg p-2 ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <TrendingUp className="h-4 w-4 text-green-500" />
      </div>
      <h3 className="mb-1 font-medium text-gray-600 dark:text-gray-400">{title}</h3>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-green-600 dark:text-green-400">{delta}</p>
    </Card>
  );
}

interface FeedRow {
  onchainId: string;
  clientRef: string;
  status: string;
  reason: string | null;
  amount: string;
  memo: string | null;
  createdAt: string;
}

const KIND: Record<string, { Icon: LucideIcon; tint: string }> = {
  COMPLETED: { Icon: KeyRound, tint: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
  APPROVED: { Icon: Shield, tint: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" },
  REJECTED: { Icon: Ban, tint: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
  FAILED: { Icon: Ban, tint: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
  PENDING_APPROVAL: { Icon: Bell, tint: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" },
};

export default function Overview() {
  const vaultId = "avfinal.testnet";
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    api<Record<string, unknown>>(`/vaults/${vaultId}/summary`).then(setSummary).catch((e: Error) => setError(e.message));
    api<{ rows: FeedRow[] }>(`/vaults/${vaultId}/requests?limit=20`)
      .then((d) => setRows(d.rows ?? []))
      .catch(() => undefined);
  };

  useEffect(() => {
    void load();
    const unsub = subscribeStream(vaultId, (t) => {
      if (t.startsWith("request")) void load();
    });
    const t = setInterval(load, 6000);
    return () => {
      unsub();
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p role="alert" className="text-red-500">Something went wrong — {error}</p>;
  const approved = Number(summary?.approved ?? 0);
  const rejected = Number(summary?.rejected ?? 0);
  const spent = summary?.spent ? (Number(BigInt(String(summary.spent)) / NEAR) / 1e24).toFixed(2) : "0";
  const requests = Number(summary?.requests ?? 0);
  const blockedPct = requests > 0 ? Math.round((rejected / requests) * 100) : 0;
  const containment = requests > 0 ? Math.round((rejected / requests) * 100) : 0;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Welcome back — live policy feed for <span className="row-mono">{vaultId}</span></p>
        </div>
        <Link to={`/v/${vaultId}/security`} className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700">
          View attack suite
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Approved payments" value={String(approved)} delta="completed end to end" Icon={DollarSign} tint="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" />
        <StatCard title="Blocked attacks" value={String(rejected)} delta="rejected by policy" Icon={Shield} tint="bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" />
        <StatCard title="Spent (NEAR)" value={humanAmount(String(summary?.spent ?? "0"))} delta="all time" Icon={Users} tint="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" />
        <StatCard title="Requests indexed" value={String(requests)} delta="live feed below" Icon={FileText} tint="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent activity</h3>
            <Link to={`/v/${vaultId}/requests`} className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
              View all
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">No requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.slice(0, 6).map((r) => {
                const kind = KIND[r.status] ?? { Icon: Activity, tint: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
                return (
                  <li key={r.onchainId}>
                    <Link to={`/v/${vaultId}/requests/${r.onchainId}`} className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className={`rounded-lg p-2 ${kind.tint}`} aria-hidden>
                        <kind.Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{humanAmount(String(r.amount))} NEAR · {r.status}</p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{String(r.reason ?? r.clientRef)}</p>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(String(r.createdAt)).toLocaleTimeString()}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Containment rate</span>
                <span className="text-sm font-medium">{blockedPct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: `${containment}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Approval rate</span>
                <span className="text-sm font-medium">{requests ? Math.round((approved / requests) * 100) : 0}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-2 rounded-full bg-green-500" style={{ width: `${requests ? (approved / requests) * 100 : 0}%` }} />
              </div>
            </div>
          </Card>
          <Card>
            <h3 className="mb-4 text-lg font-semibold">Top payees</h3>
            <div className="space-y-3">
              {["avpayee.testnet"].map((p, i) => (
                <div key={p} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{p}</span>
                  <span className="text-sm font-medium">${Math.floor(1200 - i * 300)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
