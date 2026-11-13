import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CircleDollarSign,
  FlaskConical,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Users,
  Vault,
} from 'lucide-react';
import { useVault } from '../state/vault';
import { amountWithSymbol, cn, shortDate, truncateMiddle } from '../lib/utils';
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  SectionTitle,
  Skeleton,
} from '../components/ui';
import { ApiOffline } from '../components/Guards';

export default function Vaults() {
  const { vaults, vaultId, setVaultId, summary, error, loading, refresh } = useVault();
  const navigate = useNavigate();

  if (error && vaults.length === 0) return <ApiOffline message={error.message} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Vaults</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Every vault this API indexes. Simulator vaults are deterministic and offline; contract
            vaults are read from {summary?.network ?? 'NEAR'} and mutated only by owner signatures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" className="text-xs" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="primary" className="text-xs" onClick={() => navigate('/app/vaults/new')}>
            <PlusCircle className="h-3.5 w-3.5" /> New vault
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Panel className="flex items-center gap-3 p-4">
          <Boxes className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Indexed vaults</p>
            <p className="text-lg font-semibold text-slate-100">{vaults.length}</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <ShieldCheck className="h-5 w-5 text-green-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Active context</p>
            <p className="truncate text-sm font-medium text-slate-200">
              {summary?.label ?? vaultId ?? 'none selected'}
            </p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-3 p-4">
          <FlaskConical className="h-5 w-5 text-amber-700" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Simulator vaults</p>
            <p className="text-lg font-semibold text-slate-100">
              {vaults.filter((vault) => vault.mode === 'local').length}
            </p>
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionTitle
          title="Directory"
          subtitle="Selecting a vault switches the whole console, including approvals and the red-team history."
        />
        {loading && vaults.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : vaults.length === 0 ? (
          <EmptyState
            title="No vaults yet"
            description="Create a simulator vault to explore the full policy engine without spending anything."
            icon={<Vault className="h-5 w-5" />}
            action={
              <Button variant="primary" onClick={() => navigate('/app/vaults/new')}>
                <PlusCircle className="h-4 w-4" /> Create a vault
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {vaults.map((vault) => {
              const near = vault.balances.find((balance) => balance.asset === 'NEAR');
              const stable = vault.balances.find((balance) => balance.asset.startsWith('ft:'));
              const activeAgents = vault.agents.filter((agent) => agent.status === 'ACTIVE').length;
              const selected = vault.vaultId === vaultId;
              return (
                <div
                  key={vault.vaultId}
                  className={cn(
                    'rounded-xl border p-4 transition',
                    selected
                      ? 'border-green-300 bg-green-50'
                      : 'border-ink-700 bg-ink-850 hover:border-ink-600',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">
                          {vault.label ?? vault.vaultId}
                        </span>
                        <Badge tone={vault.mode === 'local' ? 'amber' : 'green'} dot>
                          {vault.mode === 'local' ? 'simulator' : `${vault.network} contract`}
                        </Badge>
                        {vault.paused ? <Badge tone="red">paused</Badge> : <Badge tone="slate">running</Badge>}
                        {selected ? <Badge tone="blue">current</Badge> : null}
                      </div>
                      <p className="mono mt-1 text-[11px] text-slate-500">{vault.vaultId}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        owner {truncateMiddle(vault.ownerId, 14, 10)} · v{vault.contractVersion} ·
                        updated {shortDate(vault.updatedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!selected ? (
                        <Button
                          variant="default"
                          className="text-xs"
                          onClick={() => {
                            setVaultId(vault.vaultId);
                            navigate('/app');
                          }}
                        >
                          <Vault className="h-3.5 w-3.5" /> Use vault
                        </Button>
                      ) : (
                        <Button variant="ghost" className="text-xs" onClick={() => navigate('/app')}>
                          Open console <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="default"
                        className="text-xs"
                        onClick={() => {
                          setVaultId(vault.vaultId);
                          navigate('/app/settings');
                        }}
                      >
                        Settings
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-700 pt-3 sm:grid-cols-4">
                    <div>
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                        <CircleDollarSign className="h-3 w-3" /> NEAR
                      </p>
                      <p className="mt-0.5 text-sm text-slate-200">
                        {near ? amountWithSymbol(near.amount, near.asset) : '—'}
                      </p>
                      {stable ? (
                        <p className="text-[11px] text-slate-500">{amountWithSymbol(stable.amount, stable.asset)}</p>
                      ) : null}
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                        <Users className="h-3 w-3" /> Agents
                      </p>
                      <p className="mt-0.5 text-sm text-slate-200">
                        {activeAgents} active / {vault.agents.length}
                      </p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                        <BadgeCheck className="h-3 w-3" /> Approvals
                      </p>
                      <p className="mt-0.5 text-sm text-slate-200">{vault.pendingApprovals}</p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                        <Activity className="h-3 w-3" /> 24h
                      </p>
                      <p className="mt-0.5 text-sm text-slate-200">
                        {vault.stats24h.approved} approved · {vault.stats24h.rejected} rejected
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
