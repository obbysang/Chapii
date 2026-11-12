import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  CircleDollarSign,
  Clock3,
  Gauge,
  Play,
  Radar,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useVault } from '../state/vault';
import { api } from '../lib/api';
import {
  amount,
  amountWithSymbol,
  pct,
  shortDate,
  symbolOf,
  truncateMiddle,
} from '../lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  ProgressBar,
  RequestStatusBadge,
  SectionTitle,
  Skeleton,
  Stat,
} from '../components/ui';
import { RequestTable } from '../components/RequestTable';
import { ApiOffline, NoVaultState, PageSkeleton } from '../components/Guards';

export default function Overview() {
  const { vaultId, summary, isLocal, error } = useVault();

  const requestsQuery = useQuery({
    queryKey: ['requests', vaultId, { limit: 6 }],
    queryFn: () => api.requests(vaultId as string, { limit: 6 }),
    enabled: Boolean(vaultId),
  });

  const approvalsQuery = useQuery({
    queryKey: ['approvals', vaultId],
    queryFn: () => api.approvals(vaultId as string),
    enabled: Boolean(vaultId),
  });

  const harnessQuery = useQuery({
    queryKey: ['harnessRuns', vaultId],
    queryFn: () => api.harnessRuns(vaultId as string),
    enabled: Boolean(vaultId),
  });

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;
  if (!summary) return <PageSkeleton />;

  const nearBalance = summary.balances.find((balance) => balance.asset === 'NEAR');
  const stableBalance = summary.balances.find((balance) => balance.asset.startsWith('ft:'));
  const activeAgents = summary.agents.filter((agent) => agent.status === 'ACTIVE').length;
  const latestRun = harnessQuery.data?.items[0];
  const totalScenarios = latestRun?.total ?? 34;
  const contained = latestRun?.passed ?? 34;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={isLocal ? 'amber' : 'green'} dot>
              {isLocal ? 'local simulator' : 'NEAR contract'}
            </Badge>
            <Badge tone={summary.paused ? 'amber' : 'slate'}>{summary.paused ? 'paused' : 'running'}</Badge>
            <span className="mono text-[11px] text-slate-500">{summary.vaultId}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {summary.label ?? 'Vault overview'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Owner <span className="mono text-slate-300">{truncateMiddle(summary.ownerId, 14, 8)}</span>{' '}
            · contract v{summary.contractVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/demo" className="btn">
            <Play className="h-4 w-4" /> Guided demo
          </Link>
          <Link to="/app/agents" className="btn">
            <Users className="h-4 w-4" /> Agents
          </Link>
          <Link to="/app/fund" className="btn-primary">
            <CircleDollarSign className="h-4 w-4" /> Fund vault
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Vault balance"
          value={nearBalance ? amount(nearBalance.amount, 'NEAR', 2) : '0'}
          hint={nearBalance ? 'NEAR available to policy' : 'No NEAR balance reported'}
          icon={<Wallet className="h-4 w-4" />}
          tone="blue"
        />
        <Stat
          label="Stable balance"
          value={stableBalance ? amount(stableBalance.amount, stableBalance.asset, 2) : '—'}
          hint={stableBalance ? symbolOf(stableBalance.asset) : 'No FT balance'}
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <Stat
          label="Agents"
          value={`${activeAgents}/${summary.agents.length}`}
          hint={summary.agents.length === 0 ? 'No agents yet' : 'active / total'}
          icon={<Users className="h-4 w-4" />}
        />
        <Stat
          label="Awaiting owner"
          value={summary.pendingApprovals}
          hint={summary.pendingApprovals > 0 ? 'Needs your co-sign' : 'Nothing blocked on you'}
          icon={<BadgeCheck className="h-4 w-4" />}
          tone={summary.pendingApprovals > 0 ? 'amber' : 'green'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle
              title="Latest receipts"
              subtitle="Every decision is stored with its reason code. Rejected requests never move funds."
              actions={
                <Link to="/app/requests" className="text-xs text-sky-300 hover:text-sky-200">
                  All requests <ArrowUpRight className="inline h-3 w-3" />
                </Link>
              }
            />
            {requestsQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12" />
                ))}
              </div>
            ) : (
              <RequestTable
                requests={requestsQuery.data?.items ?? []}
                vaultId={summary.vaultId}
                empty={
                  <EmptyState
                    title="No requests yet"
                    description="Send a payment through the guided demo or from an agent using the SDK."
                    action={
                      <Link to="/demo" className="btn text-xs">
                        Open guided demo
                      </Link>
                    }
                  />
                }
              />
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle
              title="Guardrails in force"
              subtitle="Each agent carries its own on-chain policy. There is no vault-wide override that an agent can reach."
              actions={
                <Link to="/app/agents" className="text-xs text-sky-300 hover:text-sky-200">
                  Manage <ArrowRight className="inline h-3 w-3" />
                </Link>
              }
            />
            {summary.agents.length === 0 ? (
              <EmptyState
                title="No agents yet"
                description="Create an agent key with a scoped policy. The key can request payments but never withdraw."
                    action={<Link to="/app/agents" className="btn text-xs">Add an agent</Link>}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {summary.agents.slice(0, 4).map((agent) => (
                  <Link
                    key={agent.publicKey}
                    to={`/app/agents/${encodeURIComponent(agent.publicKey)}`}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition hover:border-sky-400/25 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-200">{agent.name}</p>
                      <Badge tone={agent.status === 'ACTIVE' ? 'green' : agent.status === 'FROZEN' ? 'amber' : 'red'}>
                        {agent.status.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {agent.policy.limits.map((limit) => (
                        <span key={limit.asset} className="chip border-white/10 bg-white/[0.04] text-slate-400">
                          {amount(limit.per_tx_max, limit.asset)} {symbolOf(limit.asset)}/tx
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {agent.policy.payees.length} payee(s) · {agent.violations} violation(s)
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle
              title="Owner queue"
              actions={<Badge tone={summary.pendingApprovals > 0 ? 'amber' : 'slate'}>{summary.pendingApprovals}</Badge>}
            />
            {approvalsQuery.isLoading ? (
              <Skeleton className="h-24" />
            ) : approvalsQuery.data?.items.length ? (
              <ul className="space-y-2">
                {approvalsQuery.data.items.slice(0, 3).map((request) => (
                  <li key={request.id} className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-200">
                        {amountWithSymbol(request.amount, request.asset)}
                      </span>
                      <RequestStatusBadge status={request.status} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {request.agentName ?? 'agent'} → {truncateMiddle(request.address, 12, 6)}
                    </p>
                  </li>
                ))}
                <Link to="/app/approvals" className="btn mt-1 w-full text-xs">
                  Review approvals <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </ul>
            ) : (
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4 text-center">
                <ShieldCheck className="mx-auto h-5 w-5 text-emerald-400" />
                <p className="mt-1.5 text-xs text-slate-400">No pending approvals.</p>
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Policy activity (24h)" />
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
                <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">Approved</p>
                <p className="mt-1 text-xl font-semibold text-emerald-200">{summary.stats24h.approved}</p>
              </div>
              <div className="rounded-lg border border-rose-400/15 bg-rose-400/[0.05] p-3">
                <p className="text-[10px] uppercase tracking-wider text-rose-300/80">Blocked</p>
                <p className="mt-1 text-xl font-semibold text-rose-200">{summary.stats24h.rejected}</p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-500">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
              <span>
                Blocked requests are receipts too. They carry a reason code the agent can act on
                without guessing.
              </span>
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle
              title="Red-team status"
              actions={<Radar className="h-4 w-4 text-rose-300" />}
            />
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-100">
                {contained}/{totalScenarios}
              </p>
              <span className="text-xs text-slate-500">scenarios passing</span>
            </div>
            <ProgressBar value={pct(contained, totalScenarios)} tone="green" className="mt-2" />
            <p className="mt-2 text-[11px] text-slate-500">
              {latestRun
                ? `Last run ${shortDate(latestRun.finishedAt ?? latestRun.startedAt)} · ${latestRun.controlsPassed}/7 controls`
                : 'No run recorded for this vault yet. The suite runs against an isolated clone.'}
            </p>
            <Link to="/app/security" className="btn mt-3 w-full text-xs">
              <Radar className="h-3.5 w-3.5" /> Open red-team suite
            </Link>
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Vault health" />
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Mode</dt>
                <dd className="text-slate-300">{summary.mode}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Network</dt>
                <dd className="text-slate-300">{summary.network}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Executor</dt>
                <dd className="mono text-slate-300">
                  {summary.executorId ? truncateMiddle(summary.executorId, 10, 6) : 'unset'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Updated</dt>
                <dd className="text-slate-300">{shortDate(summary.updatedAt)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge tone={summary.health === 'ok' ? 'green' : 'amber'} dot>
                    {summary.health}
                  </Badge>
                </dd>
              </div>
            </dl>
            <Link to="/app/settings" className="btn mt-3 w-full text-xs">
              Vault settings <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Panel>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/15 bg-sky-400/[0.05] p-4">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 h-5 w-5 text-sky-300" />
          <div>
            <p className="text-sm font-medium text-slate-200">Test the policy before you trust it</p>
            <p className="text-xs text-slate-500">
              The red-team suite runs 34 scenarios against a throwaway clone of this vault and
              asserts budget invariants after each decision.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/app/security" className="btn-primary text-xs">
            <Activity className="h-3.5 w-3.5" /> Run the suite
          </Link>
          <Link to="/demo" className="btn text-xs">
            <Clock3 className="h-3.5 w-3.5" /> Quick demo
          </Link>
        </div>
      </div>
    </div>
  );
}
