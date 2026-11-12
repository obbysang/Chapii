import type { ReactNode } from 'react';
import { ToastProvider } from './state/toast';
import { VaultProvider, useVault } from './state/vault';
import { WalletProvider } from './state/wallet';
import App from './App';

function WalletNetworkBridge({ children }: { children: ReactNode }) {
  const { health } = useVault();
  return (
    <WalletProvider network={health?.network === 'mainnet' ? 'mainnet' : 'testnet'}>
      {children}
    </WalletProvider>
  );
}

export default function Root() {
  return (
    <ToastProvider>
      <VaultProvider>
        <WalletNetworkBridge>
          <App />
        </WalletNetworkBridge>
      </VaultProvider>
    </ToastProvider>
  );
}
