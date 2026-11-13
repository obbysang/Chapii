import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleDollarSign,
  Copy,
  Globe2,
  Info,
  Loader2,
  RefreshCw,
  Send,
  Wallet,
} from 'lucide-react';
import type { IntentsQuote } from '@agentvault/shared';
import { api } from '../lib/api';
import { useVault } from '../state/vault';
import { useToast } from '../state/toast';
import { useWallet } from '../state/wallet';
import {
  amount,
  amountWithSymbol,
  cn,
  copyText,
  shortDate,
  symbolOf,
  toRaw,
  truncateMiddle,
} from '../lib/utils';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Panel,
  SectionTitle,
  Select,
  Stat,
} from '../components/ui';
import { ApiOffline, NoVaultState } from '../components/Guards';

const ASSETS = ['NEAR', 'ft:usdc.testnet', 'ft:usdt.testnet'];

export default function Fund() {
  const { vaultId, summary, isLocal, error, refresh } = useVault();
  const toast = useToast();
  const wallet = useWallet();
  const queryClient = useQueryClient();

  const [depositAsset, setDepositAsset] = useState('NEAR');
  const [depositAmount, setDepositAmount] = useState('50');
  const [withdrawAsset, setWithdrawAsset] = useState('NEAR');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawTo, setWithdrawTo] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [quote, setQuote] = useState<IntentsQuote | null>(null);
  const [originAsset, setOriginAsset] = useState('');
  const [destinationAsset, setDestinationAsset] = useState('');
  const [quoteAmount, setQuoteAmount] = useState('');

  const intentsQuery = useQuery({
    queryKey: ['intentsConfig'],
    queryFn: api.intentsConfig,
    retry: false,
  });

  const deposit = useMutation({
    mutationFn: async () => {
      if (!vaultId) return;
      const decimals = depositAsset === 'NEAR' ? 24 : 6;
      const raw = toRaw(depositAmount, decimals);
      if (isLocal) {
        await api.fundLocal(vaultId, depositAsset, raw);
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      if (depositAsset !== 'NEAR') {
        throw new Error('FT deposits need an ft_transfer from the token holder to the vault account.');
      }
      await wallet.sendNear({ to: vaultId, amount: raw });
    },
    onSuccess: async () => {
      toast.success('Deposit submitted', `${depositAmount} ${symbolOf(depositAsset)}`);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['vault', vaultId] });
    },
    onError: (depositError) =>
      toast.error('Deposit failed', depositError instanceof Error ? depositError.message : String(depositError)),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      if (!vaultId) return;
      const decimals = withdrawAsset === 'NEAR' ? 24 : 6;
      const raw = toRaw(withdrawAmount, decimals);
      if (isLocal) {
        await api.localAction(vaultId, {
          type: 'withdraw',
          asset: withdrawAsset,
          amount: raw,
          to: withdrawTo.trim(),
        });
        return;
      }
      if (!wallet.accountId) await wallet.connect({ contractId: vaultId });
      if (withdrawAsset === 'NEAR') {
        await wallet.callMethod({
          contractId: vaultId,
          method: 'withdraw_near',
          args: { amount: raw, to: withdrawTo.trim() },
        });
      } else {
        await wallet.callMethod({
          contractId: vaultId,
          method: 'withdraw_ft',
          args: { token: withdrawAsset.slice(3), amount: raw, to: withdrawTo.trim() },
        });
      }
    },
    onSuccess: async () => {
      toast.success('Withdrawal submitted', `${withdrawAmount} ${symbolOf(withdrawAsset)}`);
      setConfirmWithdraw(false);
      setWithdrawAmount('');
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['vault', vaultId] });
    },
    onError: (withdrawError) =>
      toast.error('Withdrawal failed', withdrawError instanceof Error ? withdrawError.message : String(withdrawError)),
  });

  const quoteMutation = useMutation({
    mutationFn: () => {
      if (!vaultId) throw new Error('no vault');
      return api.intentsQuote({
        vaultId,
        originAsset: originAsset.trim(),
        destinationAsset: destinationAsset.trim(),
        amount: quoteAmount.trim(),
        refundTo: vaultId,
      });
    },
    onSuccess: (result) => {
      setQuote(result);
      toast.success('Quote received', 'Deposit address issued by 1-Click.');
    },
    onError: (quoteError) =>
      toast.error('Quote failed', quoteError instanceof Error ? quoteError.message : String(quoteError)),
  });

  if (error && !summary) return <ApiOffline message={error.message} />;
  if (!vaultId) return <NoVaultState />;

  const balances = summary?.balances ?? [];
  const intentsEnabled = intentsQuery.data?.enabled ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Funds</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            The vault holds the money. Agents can only request payments from it, and the owner is
            the only key that can withdraw.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void refresh()} aria-label="Refresh balances">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.length === 0 ? (
          <Panel className="col-span-full p-5 text-sm text-slate-400">No balances reported.</Panel>
        ) : (
          balances.slice(0, 4).map((balance) => (
            <Stat
              key={balance.asset}
              label={symbolOf(balance.asset)}
              value={amount(balance.amount, balance.asset, 2)}
              hint={balance.asset}
              icon={<CircleDollarSign className="h-4 w-4" />}
            />
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionTitle
            title="Deposit"
            subtitle={isLocal ? 'Simulated deposit into the local vault.' : 'Send value to the vault account.'}
            actions={<ArrowDownToLine className="h-4 w-4 text-green-700" />}
          />
          {isLocal ? (
            <div className="space-y-3">
              <Field label="Asset">
                <Select value={depositAsset} onChange={(event) => setDepositAsset(event.target.value)}>
                  {ASSETS.map((asset) => (
                    <option key={asset} value={asset}>
                      {symbolOf(asset)} · {asset}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount" hint="Demo balances only. No chain transaction is made.">
                <Input
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="50"
                />
              </Field>
              <Button
                variant="primary"
                className="w-full"
                loading={deposit.isPending}
                disabled={!depositAmount.trim()}
                onClick={() => deposit.mutate()}
              >
                <ArrowDownToLine className="h-4 w-4" /> Add demo funds
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-ink-700 bg-mist p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Vault account</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="mono min-w-0 flex-1 break-all text-xs text-slate-300">{vaultId}</code>
                  <Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => void copyText(vaultId)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <Field label="Send NEAR with your wallet">
                <Input
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="10"
                />
              </Field>
              <Button
                variant="primary"
                className="w-full"
                loading={deposit.isPending}
                disabled={!depositAmount.trim()}
                onClick={() => deposit.mutate()}
              >
                <Send className="h-4 w-4" /> Send NEAR to vault
              </Button>
              <p className="text-[11px] leading-relaxed text-slate-500">
                For FTs, call <code className="font-mono">ft_transfer</code> on the token contract
                with the vault account as receiver. The vault does not auto-register storage.
              </p>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <SectionTitle
            title="Withdraw"
            subtitle="Owner-only. The agent key is rejected by assert_owner."
            actions={<ArrowUpFromLine className="h-4 w-4 text-rose-600" />}
          />
          <div className="space-y-3">
            <Field label="Asset">
              <Select value={withdrawAsset} onChange={(event) => setWithdrawAsset(event.target.value)}>
                {balances.map((balance) => (
                  <option key={balance.asset} value={balance.asset}>
                    {symbolOf(balance.asset)} · {balance.asset}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                inputMode="decimal"
                placeholder="1.5"
              />
            </Field>
            <Field label="Recipient account">
              <Input
                value={withdrawTo}
                onChange={(event) => setWithdrawTo(event.target.value)}
                placeholder="owner.testnet"
                className="mono"
              />
            </Field>
            <Button
              variant="danger"
              className="w-full"
              disabled={!withdrawAmount.trim() || !withdrawTo.trim()}
              onClick={() => setConfirmWithdraw(true)}
            >
              <ArrowUpFromLine className="h-4 w-4" /> Withdraw
            </Button>
          </div>
        </Panel>
      </div>

      <Panel className="p-5">
        <SectionTitle
          title="Cross-chain funding"
          subtitle="NEAR Intents 1-Click. Quotes are proxied server-side; the JWT never reaches this browser."
          actions={
            <Badge tone={intentsEnabled ? 'violet' : 'slate'}>
              <Globe2 className="h-3 w-3" /> {intentsEnabled ? 'configured' : 'not configured'}
            </Badge>
          }
        />
        {!intentsEnabled ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-850 p-3.5 text-xs leading-relaxed text-slate-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <span>
                Cross-chain funding is disabled. Set the following in the API environment to enable
                1-Click quotes:
                <code className="mx-1 rounded bg-ink-800 px-1 py-0.5 font-mono text-[11px]">ONECLICK_API_URL</code>
                and optionally
                <code className="mx-1 rounded bg-ink-800 px-1 py-0.5 font-mono text-[11px]">ONECLICK_JWT</code>.
                Intents is mainnet-only; the local simulator never calls it.
              </span>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
              Honesty note: a cross-chain payout is not atomic with the NEAR decision. The vault
              records the policy decision and deposit reference; delivery depends on NEAR Intents
              solvers.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <Field label="Origin asset" hint="1-Click asset id, e.g. nep141:...">
                <Input value={originAsset} onChange={(event) => setOriginAsset(event.target.value)} className="mono" placeholder="nep141:…" />
              </Field>
              <Field label="Destination asset" hint="Destination vault asset id">
                <Input value={destinationAsset} onChange={(event) => setDestinationAsset(event.target.value)} className="mono" placeholder="nep141:…" />
              </Field>
              <Field label="Amount (smallest units)" hint="Exact integer string; decimals depend on the origin token.">
                <Input value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} className="mono" placeholder="1000000" />
              </Field>
              <Button
                variant="primary"
                className="w-full"
                loading={quoteMutation.isPending}
                disabled={!originAsset.trim() || !destinationAsset.trim() || !quoteAmount.trim()}
                onClick={() => quoteMutation.mutate()}
              >
                Get 1-Click quote
              </Button>
            </div>
            <div className="rounded-xl border border-ink-700 bg-mist p-4">
              {quote ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-green-700">
                    <Check className="h-4 w-4" /> Quote received
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Deposit address</p>
                  <div className="flex items-center gap-2">
                    <code className="mono min-w-0 flex-1 break-all text-slate-300">{quote.depositAddress}</code>
                    <Button variant="ghost" className="px-2 py-1" onClick={() => void copyText(quote.depositAddress)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Amount out</p>
                  <p className="mono text-slate-300">{quote.amountOut}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Deadline</p>
                  <p className="text-slate-300">{shortDate(quote.deadline)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Provider</p>
                  <p className="text-slate-300">{quote.provider}</p>
                  <p className="pt-2 text-[11px] leading-relaxed text-slate-500">
                    Send exactly the quoted amount from the origin chain before the deadline. The
                    deposit address is real when Intents is enabled; never assume otherwise.
                  </p>
                </div>
              ) : (
                <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                  {quoteMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
                  ) : (
                    <Globe2 className="h-5 w-5 text-slate-600" />
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Quotes show the deposit address, output amount and deadline before you send
                    anything.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      <Modal
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        title="Confirm withdrawal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmWithdraw(false)}>Cancel</Button>
            <Button variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
              Withdraw {withdrawAmount} {symbolOf(withdrawAsset)}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            Move <strong>{withdrawAmount} {symbolOf(withdrawAsset)}</strong> from the vault to{' '}
            <span className="mono text-slate-200">{withdrawTo || '—'}</span>?
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-100 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Withdrawals bypass agent policies but are still owner-signed. Double-check the
              recipient: on-chain transfers are irreversible.
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-ink-850 p-2.5 text-xs">
            <span className="text-slate-500">Vault</span>
            <span className="mono text-slate-300">{truncateMiddle(vaultId, 18, 8)}</span>
          </div>
        </div>
      </Modal>

      <div className={cn('rounded-xl border p-4 text-[11px] leading-relaxed', isLocal ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-ink-700 bg-ink-850 text-slate-500')}>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Wallet className="h-3.5 w-3.5" /> {isLocal ? 'Simulator mode' : 'Real funds'}
        </span>{' '}
        {isLocal
          ? 'Balances are local integers in the deterministic engine. Deposits and withdrawals change demo state only.'
          : 'This vault holds real assets on the selected network. Verify every recipient and amount before signing.'}
      </div>
    </div>
  );
}
