import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Policy } from '@agentvault/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  Fingerprint,
  KeyRound,
  ShieldOff,
  Snowflake,
  Sun,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import { useWallet } from '../state/wallet';
import {
  amount,
  cn,
  copyText,
  pct,
  shortDate,
  symbolOf,
  truncateMiddle,
} from '../lib/utils';
import {
  AgentStatusBadge,
  Badge,
  Button,
  EmptyState,
  Field,
  KeyValue,
  Modal,
  Panel,
  ProgressBar,
  RequestStatusBadge,
  SectionTitle,
  Skeleton,
} from '../components/ui';
import { RequestTable } from '../components/RequestTable';
import { ApiOffline, NoVaultState } from '../components/Guards';
import { PolicyEditor } from '../components/PolicyEditor';

export default function AgentDetail() {
  const { pk = '' } = useParams();
  const publicKey = decodeURIComponent(pk);
  const { vaultId, summary, isLocal, error } = useVault();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const agentQuery = useQuery({
    queryKey: ['agent', vaultId, publicKey],
    queryFn: () => api.agent(vaultId as string, publicKey),
    enabled: Boolean(vaultId && publicKey),
  });

  const budgetQuery = useQuery({
    queryKey: ['budget', vaultId, publicKey],
    queryFn: () => api.budget(vaultId as string, publicKey),
    enabled: Boolean(vaultId && publicKey),
  });

  const requestsQuery = useQuery({
    queryKey: ['requests', vaultId, { agent: publicKey, limit: 25 }],
    queryFn: () => api.requests(vaultId as string, { agent: publicKey, limit: 25 }),
    enabled: Boolean(vaultId && publicKey),
  });

  const act = useMutation({
    mutationFn: async ({ action, nextPolicy }: { action: 'freeze' | 'unfreeze' | 'revoke' | 'update'; nextPolicy?: Policy }) => {
      if (!vaultId) return;
      if (isLocal) {
        if (action === 'update') {
          await api.localAction(vaultId, { type: 'update_policy', publicKey, policy: nextPolicy as Policy });
        } else {
          await api.localAction(vaultId, {
            type: action === 'freeze' ? 'freeze_agent' : action === 'unfreeze' ? 'unfreeze_agent' : 'revoke_agent',
            publicKey,
          });
        }
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      if (action === 'update') {
        await wallet.callMethod({
          contractId: vaultId,
          method: 'update_policy',
          args: { public_key: publicKey, policy: nextPolicy },
        });
      } else {
        await wallet.callMethod({
          contractId: vaultId,
          method: action === 'freeze' ? 'freeze_agent' : action === 'unfreeze' ? 'unfreeze_agent' : 'revoke_agent',
          args: { public_key: publicKey },
        });
      }
    },
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.action === 'revoke'
          ? 'Agent revoked'
          : variables.action === 'freeze'
            ? 'Agent frozen'
            : variables.action === 'unfreeze'
              ? 'Agent unfrozen'
              : 'Policy updated',
      );
      setEditOpen(false);
      setRevokeOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agent', vaultId, publicKey] }),
        queryClient.invalidateQueries({ queryKey: ['agents', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['budget', vaultId, publicKey] }),
        queryClient.invalidateQueries({ queryKey: ['vault', vaultId] }),
      ]);
      if (variables.action === 'revoke') navigate('/app/agents');
    },
    onError: (mutationError) =>
      toast.error('Action failed', mutationError instanceof Error ? mutationError.message : String(mutationError)),
  });

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;
  if (agentQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (agentQuery.error || !agentQuery.data) {
    return (
      <div className="space-y-4">
        <Link to="/app/agents" className="btn text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to agents
        </Link>
        <Panel className="p-6">
          <EmptyState
            title="Agent not found"
            description="This key is not registered in the current vault, or it was removed."
          />
        </Panel>
      </div>
    );
  }

  const agent = agentQuery.data;
  const budget = budgetQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/agents" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Agents
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{agent.name}</h1>
              <AgentStatusBadge status={agent.status} />
              {agent.policy.expires_at_ns ? (
                <Badge tone="slate">
                  expires {shortDate(new Date(agent.policy.expires_at_ns / 1_000_000).toISOString())}
                </Badge>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void copyText(agent.publicKey).then((ok) => ok && toast.success('Public key copied'))}
              className="mono flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300"
            >
              {agent.publicKey} <Copy className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => { setPolicy(agent.policy); setEditOpen(true); }}>
              <Edit3 className="h-3.5 w-3.5" /> Edit policy
            </Button>
            {agent.status === 'ACTIVE' ? (
              <Button variant="ghost" onClick={() => act.mutate({ action: 'freeze' })} disabled={act.isPending}>
                <Snowflake className="h-3.5 w-3.5" /> Freeze
              </Button>
            ) : agent.status === 'FROZEN' ? (
              <Button variant="ghost" className="text-green-700" onClick={() => act.mutate({ action: 'unfreeze' })} disabled={act.isPending}>
                <Sun className="h-3.5 w-3.5" /> Unfreeze
              </Button>
            ) : null}
            {agent.status !== 'REVOKED' ? (
              <Button variant="danger" onClick={() => setRevokeOpen(true)}>
                <ShieldOff className="h-3.5 w-3.5" /> Revoke
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle
              title="Budget today"
              subtitle="Budget counters live inside the contract, per agent and per asset."
              actions={budgetQuery.isFetching ? <Badge tone="blue">syncing</Badge> : null}
            />
            {!budget ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="space-y-4">
                {budget.per_asset.map((entry) => {
                  const used = pct(Number(entry.spent_today), Number(entry.daily_max));
                  return (
                    <div key={entry.asset}>
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-300">{symbolOf(entry.asset)}</span>
                        <span className="text-slate-500">
                          {amount(entry.spent_today, entry.asset)} spent · {amount(entry.remaining, entry.asset)} remaining
                        </span>
                      </div>
                      <ProgressBar value={used} tone={used > 85 ? 'red' : used > 60 ? 'amber' : 'green'} />
                      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                        <span>per payment {amount(entry.per_tx_max, entry.asset)}</span>
                        <span>daily {amount(entry.daily_max, entry.asset)}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-2 gap-3 border-t border-ink-700 pt-3 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-slate-500">Rate left</p>
                    <p className="mt-0.5 text-slate-200">{budget.rate_remaining}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Violations</p>
                    <p className="mt-0.5 text-slate-200">{budget.violations}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Status</p>
                    <p className="mt-0.5 text-slate-200">{budget.status.toLowerCase()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Expires</p>
                    <p className="mt-0.5 text-slate-200">
                      {budget.expires_at_ns ? shortDate(new Date(budget.expires_at_ns / 1_000_000).toISOString()) : 'never'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel className="p-5">
            <SectionTitle
              title="Receipts from this agent"
              subtitle={`${requestsQuery.data?.items.length ?? 0} shown`}
            />
            <RequestTable
              requests={requestsQuery.data?.items ?? []}
              vaultId={vaultId}
              showAgent={false}
              empty={<EmptyState title="No receipts yet" description="This key has not called request_payment." />}
            />
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Allowlisted payees" subtitle="Exact chain and address pairs. No wildcards." />
            {agent.policy.payees.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                No payees are allowlisted. Every payment will be rejected with PAYEE_NOT_ALLOWED.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-[10px] uppercase tracking-wider text-slate-500">
                      <th scope="col" className="px-2 py-2 font-semibold">Label</th>
                      <th scope="col" className="px-2 py-2 font-semibold">Chain</th>
                      <th scope="col" className="px-2 py-2 font-semibold">Address</th>
                      <th scope="col" className="px-2 py-2 font-semibold">Dest. assets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agent.policy.payees.map((payee) => (
                      <tr key={`${payee.chain}:${payee.address}`} className="border-b border-ink-700/70 last:border-0">
                        <td className="px-2 py-2.5 text-xs text-slate-200">{payee.label}</td>
                        <td className="px-2 py-2.5 text-xs uppercase text-slate-500">{payee.chain}</td>
                        <td className="mono px-2 py-2.5 text-[11px] text-slate-300">{truncateMiddle(payee.address, 18, 10)}</td>
                        <td className="px-2 py-2.5 text-[11px] text-slate-500">
                          {payee.allowed_dest_assets.length ? payee.allowed_dest_assets.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle title="Key scope" subtitle="What this key can and cannot do." />
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
                <div className="text-xs">
                  <p className="font-medium text-green-700">request_payment</p>
                  <p className="mt-0.5 text-green-700">Create a payment request within policy.</p>
                </div>
              </div>
              {['withdraw_near / withdraw_ft', 'add_agent / update_policy', 'pause / set_executor', 'approve_request'].map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-850 p-3">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <div className="text-xs">
                    <p className="font-medium text-slate-300">{item}</p>
                    <p className="mt-0.5 text-slate-500">Owner-only. Rejected by assert_owner.</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Policy limits" />
            <div className="space-y-3">
              {agent.policy.limits.map((limit) => (
                <div key={limit.asset} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{symbolOf(limit.asset)}</span>
                    <span className="text-[10px] text-slate-500">{limit.asset}</span>
                  </div>
                  <dl className="mt-1.5 space-y-1 text-[11px]">
                    <div className="flex justify-between"><dt className="text-slate-500">Per payment</dt><dd className="text-slate-300">{amount(limit.per_tx_max, limit.asset)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Daily cap</dt><dd className="text-slate-300">{amount(limit.daily_max, limit.asset)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Co-sign above</dt><dd className="text-slate-300">{limit.cosign_above ? amount(limit.cosign_above, limit.asset) : 'never'}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <dl className="mt-3">
              <KeyValue label="Requests / hour">{agent.policy.max_requests_per_hour}</KeyValue>
              <KeyValue label="Freeze after">{agent.policy.freeze_after_violations === 0 ? 'disabled' : `${agent.policy.freeze_after_violations} violations`}</KeyValue>
              <KeyValue label="Violations now">{agent.violations}</KeyValue>
              <KeyValue label="Created">{shortDate(agent.createdAt)}</KeyValue>
            </dl>
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Fingerprint" />
            <div className="rounded-lg border border-ink-700 bg-mist p-3">
              <p className="mono break-all text-[11px] leading-relaxed text-slate-400">{agent.publicKey}</p>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
              <Fingerprint className="h-3.5 w-3.5" /> ed25519 public key · vault-scoped
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        wide
        title={`Edit policy for ${agent.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={act.isPending}
              disabled={!policy || Boolean(policyError)}
              onClick={() => policy && act.mutate({ action: 'update', nextPolicy: policy })}
            >
              Save policy
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Tightening a policy takes effect immediately. Loosening it is also immediate, which is why
          the owner key is the only key that can call this method.
        </div>
        <PolicyEditor
          initial={agent.policy}
          onChange={(next, nextError) => {
            setPolicy(next);
            setPolicyError(nextError);
          }}
        />
      </Modal>

      <Modal
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title={`Revoke ${agent.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={act.isPending} onClick={() => act.mutate({ action: 'revoke' })}>
              Revoke permanently
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-100 p-3 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This cannot be undone. Existing budgets stop being spendable and the key can never be
            unfrozen. Create a new agent if you need to restore access.
          </span>
        </div>
      </Modal>

      <div className="rounded-xl border border-ink-700 bg-ink-850 p-4 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-400">
          <KeyRound className="h-3.5 w-3.5" /> Key handling
        </span>{' '}
        {isLocal
          ? 'Local simulator: this key was generated server-side for the demo. Never reuse demo keys for value.'
          : 'The public key is on-chain; the private key belongs in the agent runtime secret store, never in this dashboard.'}
      </div>
    </div>
  );
}
