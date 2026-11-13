import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { WalletSelector } from '@near-wallet-selector/core';

const STORAGE_KEY = 'agentvault.wallet.connected';

interface WalletContextValue {
  accountId: string | null;
  connecting: boolean;
  error: string | null;
  connect: (options?: { contractId?: string }) => Promise<string | null>;
  disconnect: () => Promise<void>;
  callMethod: (options: {
    contractId: string;
    method: string;
    args?: Record<string, unknown>;
    gas?: string;
    deposit?: string;
  }) => Promise<void>;
  sendNear: (options: { to: string; amount: string }) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const selectors = new Map<string, Promise<WalletSelector>>();

function selectorFor(network: 'testnet' | 'mainnet'): Promise<WalletSelector> {
  const existing = selectors.get(network);
  if (existing) return existing;
  // Wallet code is heavy (~800 kB) and unnecessary for the read-only demo, so
  // it is only fetched when a visitor actually connects or resumes a session.
  const created = (async () => {
    const [{ setupWalletSelector }, { setupNearWallet }] = await Promise.all([
      import('@near-wallet-selector/core'),
      import('@near-wallet-selector/near-wallet'),
    ]);
    return setupWalletSelector({
      network,
      modules: [setupNearWallet()],
    });
  })();
  selectors.set(network, created);
  return created;
}

export function WalletProvider({
  children,
  network = 'testnet',
}: {
  children: ReactNode;
  network?: 'testnet' | 'mainnet';
}) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore a previous session without opening a wallet popup.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== '1') return;
    let cancelled = false;
    void (async () => {
      try {
        const selector = await selectorFor(network);
        const account = selector.store.getState().accounts[0];
        if (!cancelled && account) setAccountId(account.accountId);
      } catch {
        // Read-only mode is fine; the demo never needs a wallet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [network]);

  const connect = useCallback(
    async (options?: { contractId?: string }) => {
      setConnecting(true);
      setError(null);
      try {
        const selector = await selectorFor(network);
        const wallet = await selector.wallet();
        const existing = selector.store.getState().accounts[0];
        if (existing) {
          setAccountId(existing.accountId);
          localStorage.setItem(STORAGE_KEY, '1');
          return existing.accountId;
        }
        await wallet.signIn({
          contractId: options?.contractId ?? (network === 'mainnet' ? 'near' : 'testnet'),
          methodNames: [],
          // Wallet Selector 8.9.3 intersects every wallet's sign-in params, so the
          // hardware-wallet field is required by the type even for browser wallets.
          accounts: [],
        });
        const account = selector.store.getState().accounts[0];
        if (!account) throw new Error('wallet returned no account');
        setAccountId(account.accountId);
        localStorage.setItem(STORAGE_KEY, '1');
        return account.accountId;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [network],
  );

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      const selector = await selectorFor(network);
      const wallet = await selector.wallet();
      await wallet.signOut();
    } catch {
      // Clearing local state is enough for read-only usage.
    }
    localStorage.removeItem(STORAGE_KEY);
    setAccountId(null);
  }, [network]);

  const callMethod = useCallback(
    async (options: {
      contractId: string;
      method: string;
      args?: Record<string, unknown>;
      gas?: string;
      deposit?: string;
    }) => {
      setError(null);
      try {
        const selector = await selectorFor(network);
        const wallet = await selector.wallet();
        await wallet.signAndSendTransaction({
          receiverId: options.contractId,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: options.method,
                args: options.args ?? {},
                gas: options.gas ?? '150000000000000',
                deposit: options.deposit ?? '0',
              },
            },
          ],
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        throw cause;
      }
    },
    [network],
  );

  const sendNear = useCallback(
    async (options: { to: string; amount: string }) => {
      setError(null);
      try {
        const selector = await selectorFor(network);
        const wallet = await selector.wallet();
        await wallet.signAndSendTransaction({
          receiverId: options.to,
          actions: [{ type: 'Transfer', params: { deposit: options.amount } }],
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        throw cause;
      }
    },
    [network],
  );

  const value = useMemo<WalletContextValue>(
    () => ({ accountId, connecting, error, connect, disconnect, callMethod, sendNear }),
    [accountId, connecting, error, connect, disconnect, callMethod, sendNear],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error('useWallet must be used inside <WalletProvider>');
  return value;
}
