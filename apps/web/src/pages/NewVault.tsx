import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BadgeCheck,
  Boxes,
  FlaskConical,
  Globe2,
  Info,
  Link2,
  Loader2,
  PlusCircle,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import { cn, toRaw, truncateMiddle } from '../lib/utils';
import { Badge, Button, Field, Input, Panel, Tabs } from '../components/ui';

type Mode = 'local' | 'register';

const LOCAL_OWNER_DEFAULT = 'demo-owner.testnet';

export default function NewVault() {
  const { health, setVaultId, refresh } = useVault();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>(health?.mode === 'near' ? 'register' : 'local');

  const [label, setLabel] = useState('My agent treasury');
  const [ownerId, setOwnerId] = useState(LOCAL_OWNER_DEFAULT);
  const [fundingNear, setFundingNear] = useState('25');
  const [fundUsdc, setFundUsdc] = useState('100');

  const [vaultId, setVaultIdInput] = useState('');
  const [registerLabel, setRegisterLabel] = useState('');
  const [confirmRegister, setConfirmRegister] = useState(false);

  const createLocal = useMutation({
    mutationFn: async () => {
      if (!/^\d+(\.\d+)?$/.test(fundingNear.trim())) {
        throw new Error('Funding must be a positive decimal amount of NEAR.');
      }
      if (fundUsdc.trim() !== '' && !/^\d+(\.\d+)?$/.test(fundUsdc.trim())) {
        throw new Error('USDC funding must be a decimal amount or left empty.');
      }
      return api.createLocalVault({
        label: label.trim() || undefined,
        ownerId: ownerId.trim() || undefined,
        fundingNear: fundingNear.trim() || undefined,
        fundUsdc: fundUsdc.trim() || undefined,
      });
    },
    onSuccess: async (summary) => {
      setVaultId(summary.vaultId);
      await queryClient.invalidateQueries({ queryKey: ['vaults'] });
      await refresh();
      toast.success('Simulator vault created', `${summary.vaultId} is ready with two demo agents.`);
      navigate('/app');
    },
    onError: (error) =>
      toast.error(
        'Could not create vault',
        error instanceof Error ? error.message : String(error),
      ),
  });

  const register = useMutation({
    mutationFn: async () => {
      const trimmed = vaultId.trim();
      if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(trimmed)) {
        throw new Error('Enter a valid NEAR account id, for example vault.alice.testnet.');
      }
      if (!confirmRegister) {
        throw new Error('Confirm that the contract is deployed and owned by you before registering.');
      }
      return api.registerVault({
        vaultId: trimmed,
        label: registerLabel.trim() || null,
      });
    },
    onSuccess: async (summary) => {
      setVaultId(summary.vaultId);
      await queryClient.invalidateQueries({ queryKey: ['vaults'] });
      await refresh();
      toast.success('Contract registered', `${summary.vaultId} is indexed from ${summary.network}.`);
      navigate('/app');
    },
    onError: (error) =>
      toast.error(
        'Registration failed',
        error instanceof Error ? error.message : String(error),
      ),
  });

  const previewNear = useMemo(() => {
    try {
      return toRaw(fundingNear || '0', 24);
    } catch {
      return null;
    }
  }, [fundingNear]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/vaults" className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" /> All vaults
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100">
          Create or register a vault
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Spin up a deterministic simulator vault for evaluation, or connect the console to an
          AgentVault contract you already deployed and own.
        </p>
      </div>

      <Tabs<Mode>
        tabs={[
          { id: 'local', label: 'Simulator vault' },
          { id: 'register', label: 'Deployed contract' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'local' ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-amber-700" />
              <h2 className="text-sm font-semibold text-slate-100">Local simulator</h2>
              <Badge tone="amber">no funds move</Badge>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createLocal.mutate();
              }}
            >
              <Field
                label="Vault label"
                hint="Shown in the sidebar. You can keep several simulator vaults side by side."
              >
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="My agent treasury"
                  maxLength={64}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Owner account id"
                  hint="The simulated owner. Approvals are signed by this identity."
                >
                  <Input
                    value={ownerId}
                    onChange={(event) => setOwnerId(event.target.value)}
                    placeholder={LOCAL_OWNER_DEFAULT}
                    maxLength={64}
                  />
                </Field>
                <Field label="Starting NEAR" hint="Simulated balance only.">
                  <Input
                    value={fundingNear}
                    onChange={(event) => setFundingNear(event.target.value)}
                    inputMode="decimal"
                    placeholder="25"
                  />
                </Field>
              </div>

              <Field
                label="Starting USDC"
                hint="Simulated mock fungible token. Leave empty for a zero balance."
              >
                <Input
                  value={fundUsdc}
                  onChange={(event) => setFundUsdc(event.target.value)}
                  inputMode="decimal"
                  placeholder="100"
                />
              </Field>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] leading-relaxed text-amber-800">
                <p className="flex items-center gap-1.5 font-semibold text-amber-800">
                  <Info className="h-3.5 w-3.5" /> What this mode does
                </p>
                <p className="mt-1.5">
                  The API runs the exact policy rules of the Rust contract in an offline engine.
                  Balances, timestamps and settlement are simulated. The generated agent key is
                  returned once so you can drive the simulator; this never happens for a real
                  contract, where only public keys are registered.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" loading={createLocal.isPending}>
                  <PlusCircle className="h-4 w-4" /> Create simulator vault
                </Button>
                <Link to="/demo" className="btn">
                  <BadgeCheck className="h-4 w-4" /> Try the guided demo first
                </Link>
              </div>
              {previewNear ? (
                <p className="text-[10px] text-slate-600">
                  Funding request: {previewNear} yoctoNEAR ·{' '}
                  {fundUsdc.trim() || '0'} USDC (mock)
                </p>
              ) : null}
            </form>
          </Panel>

          <div className="space-y-4">
            <Panel className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <ShieldCheck className="h-4 w-4 text-green-700" /> Included by default
              </h3>
              <ul className="mt-3 space-y-2.5 text-xs text-slate-400">
                {[
                  'Two agents: Research (tight caps) and Ops (larger caps, co-sign above 20 NEAR).',
                  'One blocked violation recorded so the enforcement path is visible immediately.',
                  'Allowlisted payees for NEAR, USDC and a cross-chain destination.',
                  'Owner approvals, pause, freeze, revoke, policy edits and the red-team suite.',
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Globe2 className="h-4 w-4 text-green-600" /> Want the real thing?
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Deploy the Rust contract to a testnet account, then register it in the next tab.
                The API indexes chain state and the owner signs every mutation with a NEAR wallet.
              </p>
              <p className="mt-3 font-mono text-[10px] text-slate-500">
                cargo near deploy … --initFunction new --initArgs {'{"owner_id":"you.testnet"}'}
              </p>
              <a href="/docs/README.md" className="mt-3 inline-block text-xs text-green-600 hover:text-green-700">
                Deployment guide →
              </a>
            </Panel>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold text-slate-100">Deployed contract</h2>
              <Badge tone="blue">{health?.network ?? 'testnet'}</Badge>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                register.mutate();
              }}
            >
              <Field
                label="Contract account id"
                hint="The API calls get_owner on this account to prove it is an AgentVault contract."
              >
                <Input
                  value={vaultId}
                  onChange={(event) => setVaultIdInput(event.target.value)}
                  placeholder="vault.alice.testnet"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
              </Field>
              <Field label="Label" hint="Optional display name for this console.">
                <Input
                  value={registerLabel}
                  onChange={(event) => setRegisterLabel(event.target.value)}
                  placeholder="Alice's treasury"
                  maxLength={64}
                />
              </Field>

              <button
                type="button"
                onClick={() => setConfirmRegister((value) => !value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition',
                  confirmRegister
                    ? 'border-green-300 bg-green-50'
                    : 'border-ink-700 bg-ink-850 hover:bg-ink-800',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    confirmRegister ? 'border-green-600 bg-green-500 text-[#0b120d]' : 'border-ink-600',
                  )}
                >
                  {confirmRegister ? <BadgeCheck className="h-3 w-3" /> : null}
                </span>
                <span className="text-xs leading-relaxed text-slate-300">
                  I deployed this contract and control its owner account. I understand the console is
                  read-only until my wallet signs owner actions.
                </span>
              </button>

              <div className="rounded-xl border border-ink-700 bg-ink-850 p-3.5 text-[11px] leading-relaxed text-slate-400">
                <p className="flex items-center gap-1.5 font-semibold text-slate-300">
                  <Wallet className="h-3.5 w-3.5" /> No owner keys here
                </p>
                <p className="mt-1.5">
                  Registration only records public on-chain state. Every mutation is composed in the
                  browser and signed by your NEAR wallet; the API never holds an owner key.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={register.isPending}
                  disabled={!confirmRegister}
                >
                  {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />}
                  Register contract
                </Button>
                <span className="text-[11px] text-slate-500">
                  Reads <code className="font-mono">get_owner</code> on {health?.network ?? 'testnet'}
                </span>
              </div>
            </form>
          </Panel>

          <div className="space-y-4">
            <Panel className="p-5">
              <h3 className="text-sm font-semibold text-slate-100">What gets indexed</h3>
              <dl className="mt-3 space-y-2 text-xs">
                {[
                  ['Owner', 'from get_owner'],
                  ['Agents', 'public keys + policies'],
                  ['Balances', 'NEAR and allowlisted FTs'],
                  ['Requests', 'created / decided events'],
                  ['Storage', 'get_storage_info'],
                ].map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="text-right text-slate-300">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Info className="h-4 w-4 text-green-600" /> Requirements
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-slate-400">
                <li>The account must expose AgentVault view methods.</li>
                <li>The API needs RPC access to {health?.network ?? 'testnet'}.</li>
                <li>Your browser wallet must hold the owner key to sign actions.</li>
              </ul>
              {health?.network === 'testnet' ? (
                <p className="mt-3 border-t border-ink-700 pt-3 text-[11px] text-slate-500">
                  Deploy first:{' '}
                  <span className="mono text-slate-400">
                    {truncateMiddle(vaultId || 'vault.you.testnet', 16, 10)}
                  </span>
                </p>
              ) : null}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
