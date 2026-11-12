import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Fingerprint,
  KeyRound,
  Plus,
  ShieldOff,
  Snowflake,
  Sun,
  Users,
} from 'lucide-react';
import type { Policy } from '@agentvault/shared';
import { KeyPair } from 'near-api-js';
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
  Input,
  Modal,
  Panel,
  ProgressBar,
  SectionTitle,
  Skeleton,
} from '../components/ui';
import { ApiOffline, NoVaultState } from '../components/Guards';
import { PolicyEditor } from '../components/PolicyEditor';

function AgentCard({
  vaultId,
  isLocal,
  agent,
}: {
  vaultId: string;
  isLocal: boolean;
  agent: {
    publicKey: string;
    name: string;
    status: string;
    policy: Policy;
    violations: number;
    createdAt: string;
  };
}) {
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const budgetQuery = useQuery({
    queryKey: ['budget', vaultId, agent.publicKey],
    queryFn: () => api.budget(vaultId, agent.publicKey),
  });

  const act = useMutation({
    mutationFn: async (action: 'freeze' | 'unfreeze' | 'revoke') => {
      if (isLocal) {
        await api.localAction(vaultId, {
          type:
            action === 'freeze'
              ? 'freeze_agent'
              : action === 'unfreeze'
                ? 'unfreeze_agent'
                : 'revoke_agent',
          publicKey: agent.publicKey,
        });
        return;
      }
      if (!wallet.accountId) {
        await wallet.connect({ contractId: vaultId });
      }
      await wallet.callMethod({
        contractId: vaultId,
        method:
          action === 'freeze'
            ? 'freeze_agent'
            : action === 'unfreeze'
              ? 'unfreeze_agent'
              : 'revoke_agent',
        args: { public_key: agent.publicKey },
      });
    },
    onSuccess: async (_data, action) => {
      toast.success(
        action === 'revoke' ? 'Agent revoked' : action === 'freeze' ? 'Agent frozen' : 'Agent unfrozen',
        agent.name,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agents', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['vault', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['vaults'] }),
      ]);
      setConfirmRevoke(false);
    },
    onError: (error) =>
      toast.error('Action failed', error instanceof Error ? error.message : String(error)),
  });

  const limits = agent.policy.limits;

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-xs font-semibold text-slate-300">
            {agent.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/app/agents/${encodeURIComponent(agent.publicKey)}`}
                className="truncate text-sm font-semibold text-slate-100 hover:text-sky-200"
              >
                {agent.name}
              </Link>
              <AgentStatusBadge status={agent.status} />
            </div>
            <button
              type="button"
              onClick={() => void copyText(agent.publicKey).then((ok) => ok && toast.success('Public key copied'))}
              className="mono mt-1 flex items-center gap-1 text-[10px] text-slate-500 transition hover:text-slate-300"
              title="Copy public key"
            >
              {truncateMiddle(agent.publicKey, 16, 8)} <Copy className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
        <span className="shrink-0 text-[10px] text-slate-600">{shortDate(agent.createdAt)}</span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Spending limits
          </p>
          <div className="space-y-1.5">
            {limits.map((limit) => (
              <div key={limit.asset} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">{symbolOf(limit.asset)}</span>
                <span className="text-slate-300">
                  {amount(limit.per_tx_max, limit.asset)} / {amount(limit.daily_max, limit.asset)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Guardrails
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip border-white/10 bg-white/[0.04] text-slate-400">
              {agent.policy.payees.length} payees
            </span>
            <span className="chip border-white/10 bg-white/[0.04] text-slate-400">
              {agent.policy.max_requests_per_hour}/hr
            </span>
            {agent.policy.freeze_after_violations > 0 ? (
              <span className="chip border-amber-400/20 bg-amber-400/[0.06] text-amber-300">
                freeze @ {agent.policy.freeze_after_violations}
              </span>
            ) : null}
            {agent.policy.expires_at_ns ? (
              <span className="chip border-white/10 bg-white/[0.04] text-slate-400">
                expires {shortDate(new Date(agent.policy.expires_at_ns / 1_000_000).toISOString())}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06] p-4">
        {budgetQuery.isLoading ? (
          <Skeleton className="h-10" />
        ) : budgetQuery.data ? (
          <div className="space-y-2.5">
            {budgetQuery.data.per_asset.map((entry) => {
              const used = pct(Number(entry.spent_today), Number(entry.daily_max));
              return (
                <div key={entry.asset}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Today · {symbolOf(entry.asset)}</span>
                    <span className="text-slate-400">
                      {amount(entry.spent_today, entry.asset)} / {amount(entry.daily_max, entry.asset)}
                    </span>
                  </div>
                  <ProgressBar value={used} tone={used > 85 ? 'red' : used > 60 ? 'amber' : 'green'} />
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-slate-500">
                {budgetQuery.data.violations} violation(s) this hour ·{' '}
                {budgetQuery.data.rate_remaining} request(s) left
              </span>
              <div className="flex gap-1.5">
                {agent.status === 'ACTIVE' ? (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-[11px]"
                    onClick={() => act.mutate('freeze')}
                    disabled={act.isPending}
                  >
                    <Snowflake className="h-3 w-3" /> Freeze
                  </Button>
                ) : agent.status === 'FROZEN' ? (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-[11px] text-emerald-300"
                    onClick={() => act.mutate('unfreeze')}
                    disabled={act.isPending}
                  >
                    <Sun className="h-3 w-3" /> Unfreeze
                  </Button>
                ) : null}
                {agent.status !== 'REVOKED' ? (
                  <Button
                    variant="danger"
                    className="px-2 py-1 text-[11px]"
                    onClick={() => setConfirmRevoke(true)}
                    disabled={act.isPending}
                  >
                    <ShieldOff className="h-3 w-3" /> Revoke
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">Budget unavailable.</p>
        )}
      </div>

      <Link
        to={`/app/agents/${encodeURIComponent(agent.publicKey)}`}
        className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-slate-400 transition hover:bg-white/[0.03] hover:text-slate-200"
      >
        Policy, receipts and key scope <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      <Modal
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        title={`Revoke ${agent.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRevoke(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={act.isPending} onClick={() => act.mutate('revoke')}>
              Revoke permanently
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.07] p-3 text-xs text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Revocation is permanent on-chain. The key can no longer call the vault, and it cannot be
            unfrozen. Create a new agent key instead.
          </span>
        </div>
      </Modal>
    </Panel>
  );
}

function AddAgentModal({
  open,
  onClose,
  vaultId,
  isLocal,
}: {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  isLocal: boolean;
}) {
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setResult(null);
    setName('');
    setPolicy(null);
    setPolicyError(null);
    setSubmitting(false);
    onClose();
  };

  const submit = async () => {
    if (!name.trim() || !policy) {
      toast.error('Check the form', policyError ?? 'Enter an agent name and a valid policy.');
      return;
    }
    setSubmitting(true);
    try {
      if (isLocal) {
        const created = await api.addLocalAgent(vaultId, {
          name: name.trim(),
          policy,
        });
        setResult({ publicKey: created.publicKey, privateKey: created.privateKey });
      } else {
        if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
        const key = KeyPair.fromRandom('ed25519');
        const publicKey = key.getPublicKey().toString();
        const privateKey = key.toString();
        await wallet.callMethod({
          contractId: vaultId,
          method: 'add_agent',
          args: {
            public_key: publicKey,
            name: name.trim(),
            policy,
            allowance_yocto: '1000000000000000000000000',
          },
        });
        setResult({ publicKey, privateKey });
      }
      toast.success('Agent created', 'Copy the private key now — it is shown once.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agents', vaultId] }),
        queryClient.invalidateQueries({ queryKey: ['vault', vaultId] }),
      ]);
    } catch (error) {
      toast.error('Could not create the agent', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={result ? 'Agent created — save this key' : 'Create an agent key'}
      footer={
        result ? (
          <Button variant="primary" onClick={close}>
            I saved the key
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              disabled={!name.trim() || !policy || Boolean(policyError)}
              onClick={() => void submit()}
            >
              <KeyRound className="h-3.5 w-3.5" /> Create agent
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] p-3 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The private key is shown once and is never stored by the server. Put it in the agent
              runtime's secret store; anyone holding it can request payments within this policy.
            </span>
          </div>
          <div>
            <p className="label">Agent public key</p>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-ink-950/70 p-2.5">
              <code className="mono min-w-0 flex-1 break-all text-xs text-slate-300">{result.publicKey}</code>
              <Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => void copyText(result.publicKey)}>
                Copy
              </Button>
            </div>
          </div>
          <div>
            <p className="label">Agent private key (secret)</p>
            <div className="flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-950/30 p-2.5">
              <code className="mono min-w-0 flex-1 break-all text-xs text-rose-200">{result.privateKey}</code>
              <Button
                variant="ghost"
                className="px-2 py-1 text-[11px] text-rose-200"
                onClick={() =>
                  void copyText(result.privateKey).then((ok) => ok && toast.success('Private key copied'))
                }
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!isLocal ? (
            <div className="flex items-start gap-2 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] p-3 text-xs text-sky-200">
              <Fingerprint className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This is a real vault. The key pair is generated in your browser and only the public
                key is sent to the contract. The owner wallet must sign the add_agent call.
              </span>
            </div>
          ) : null}
          <Field label="Agent name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Research agent"
              maxLength={40}
            />
          </Field>
          <PolicyEditor onChange={(next, error) => {
            setPolicy(next);
            setPolicyError(error);
          }} />
        </div>
      )}
    </Modal>
  );
}

export default function Agents() {
  const { vaultId, summary, isLocal, error } = useVault();
  const [addOpen, setAddOpen] = useState(false);

  const agentsQuery = useQuery({
    queryKey: ['agents', vaultId],
    queryFn: () => api.agents(vaultId as string),
    enabled: Boolean(vaultId),
  });

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;

  const agents = agentsQuery.data?.items ?? summary?.agents ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Agents</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Each agent gets its own key and policy. A key can request payments; it can never
            withdraw, change policy, or touch another agent&apos;s budget.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Create agent
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[11px] leading-relaxed text-slate-500">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
        <span>
          {isLocal
            ? 'Local simulator: the server generates the key pair and returns the private key once. This is a demo-only exception; production agents generate keys client-side.'
            : 'Real vault: keys are generated in your browser. Only the public key is sent on-chain.'}{' '}
          Revoking a key is permanent. Freezing preserves the key for later unfreeze.
        </span>
      </div>

      {agentsQuery.isLoading && agents.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : agents.length === 0 ? (
        <Panel className="p-6">
          <EmptyState
            title="No agents yet"
            description="Create a policy-scoped key for your first agent. Start with a conservative template and adjust as you learn."
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Create agent
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className={cn('grid gap-4', agents.length > 1 ? 'lg:grid-cols-2' : 'max-w-2xl')}>
          {agents.map((agent) => (
            <AgentCard
              key={agent.publicKey}
              vaultId={vaultId}
              isLocal={isLocal}
              agent={agent}
            />
          ))}
        </div>
      )}

      <AddAgentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        vaultId={vaultId}
        isLocal={isLocal}
      />
    </div>
  );
}
