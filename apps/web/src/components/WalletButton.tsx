import { useState } from 'react';
import { LogOut, Wallet, Loader2 } from 'lucide-react';
import { useWallet } from '../state/wallet';
import { truncateMiddle, cn } from '../lib/utils';
import { useToast } from '../state/toast';

export function WalletButton({ compact = true }: { compact?: boolean }) {
  const { accountId, connecting, connect, disconnect, error } = useWallet();
  const [open, setOpen] = useState(false);
  const toast = useToast();

  if (!accountId) {
    return (
      <button
        type="button"
        className={cn('btn text-xs', compact && 'px-2.5 py-1.5')}
        disabled={connecting}
        onClick={async () => {
          const account = await connect();
          if (account) {
            toast.success('Wallet connected', account);
          } else if (error) {
            toast.error('Wallet connection failed', error);
          }
        }}
        title="Connect a NEAR wallet for on-chain owner actions"
      >
        {connecting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Wallet className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{connecting ? 'Connecting…' : 'Connect wallet'}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/15"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="mono">{truncateMiddle(accountId, 8, 6)}</span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Close wallet menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-white/10 bg-ink-900 p-2 shadow-card">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Connected</p>
            <p className="mono break-all px-2 pb-2 text-xs text-slate-300">{accountId}</p>
            <button
              type="button"
              onClick={async () => {
                await disconnect();
                setOpen(false);
                toast.info('Wallet disconnected');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.05]"
            >
              <LogOut className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
