import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import type { WalletSelector } from "@near-wallet-selector/core";
import { NETWORK } from "./api";

// The wallet-selector v10 store/event typings vary across wallets; use a thin
// structural interface so that this wrapper does not couple to internal types.
// Anything passed to the wallet selector itself is typed by the lib.
interface SelectorLike {
  wallet: () => Promise<{ signAndSendTransactions?: (args: { transactions: unknown[] }) => Promise<unknown> }>;
  store: { getAccounts: () => Promise<Array<{ accountId: string; active: boolean }>> };
  on: (event: string, cb: () => void) => void;
}

interface WalletCtx {
  selector: WalletSelector | null;
  account: string | null;
  connect: () => void;
  signTransactions: ((txs: unknown[]) => Promise<unknown>) | null;
}

const Ctx = createContext<WalletCtx>({
  selector: null,
  account: null,
  connect: () => undefined,
  signTransactions: null,
});

export function useWallet(): WalletCtx {
  return useContext(Ctx);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [modal, setModal] = useState<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sel = await setupWalletSelector({
          network: NETWORK as "mainnet" | "testnet",
          modules: [setupMeteorWallet(), setupMyNearWallet()],
        });
        if (cancelled) return;
        const via = sel as unknown as SelectorLike;
        const m = setupModal(sel, { contractId: "agentvault" });
        setSelector(sel);
        setModal(() => m.show);
        const accounts = await via.store.getAccounts();
        setAccount(accounts.find((a) => a.active)?.accountId ?? null);
        via.on("signIn", async () => {
          const accts = await via.store.getAccounts();
          setAccount(accts.find((a) => a.active)?.accountId ?? null);
        });
        via.on("signOut", () => setAccount(null));
      } catch {
        /* wallet unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = () => modal?.();

  const signTransactions = async (txs: unknown[]): Promise<unknown> => {
    const via = selector as unknown as SelectorLike | null;
    const w = via ? await via.wallet() : null;
    if (!w?.signAndSendTransactions) throw new Error("wallet signTransactions unavailable");
    return w.signAndSendTransactions({ transactions: txs });
  };

  return (
    <Ctx.Provider value={{ selector, account, connect, signTransactions }}>
      {children}
    </Ctx.Provider>
  );
}
