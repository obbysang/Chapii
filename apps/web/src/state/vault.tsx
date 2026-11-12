import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthResponse, VaultSummary } from '@agentvault/shared';
import { api, subscribeToVault } from '../lib/api';

const VAULT_KEY = 'agentvault.vault';

export interface VaultEvent {
  event: string;
  data: Record<string, unknown>;
  receivedAt: number;
  sequence: number;
}

export type StreamStatus = 'connecting' | 'open' | 'closed';

interface VaultContextValue {
  vaultId: string | null;
  setVaultId: (id: string) => void;
  vaults: VaultSummary[];
  summary: VaultSummary | undefined;
  health: HealthResponse | undefined;
  loading: boolean;
  error: Error | null;
  isLocal: boolean;
  streamStatus: StreamStatus;
  lastEvent: VaultEvent | null;
  refresh: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [vaultId, setVaultIdState] = useState<string | null>(() =>
    localStorage.getItem(VAULT_KEY),
  );
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [lastEvent, setLastEvent] = useState<VaultEvent | null>(null);
  const sequence = useRef(0);
  const invalidationTimer = useRef<number | undefined>(undefined);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    retry: 1,
    refetchInterval: 20_000,
  });

  const vaultsQuery = useQuery({
    queryKey: ['vaults'],
    queryFn: () => api.listVaults(),
    retry: 1,
    refetchInterval: 30_000,
  });

  const vaults = vaultsQuery.data?.items ?? [];

  useEffect(() => {
    if (vaults.length === 0) return;
    const stored = vaultId ?? localStorage.getItem(VAULT_KEY);
    if (stored && vaults.some((vault) => vault.vaultId === stored)) return;
    const demo = healthQuery.data?.demoVaultId;
    const next =
      (demo && vaults.some((vault) => vault.vaultId === demo) ? demo : undefined) ??
      vaults[0]?.vaultId ??
      null;
    if (next) {
      setVaultIdState(next);
      localStorage.setItem(VAULT_KEY, next);
    }
  }, [vaults, vaultId, healthQuery.data?.demoVaultId]);

  const summaryQuery = useQuery({
    queryKey: ['vault', vaultId],
    queryFn: () => api.getVault(vaultId as string),
    enabled: Boolean(vaultId),
    retry: 1,
    refetchInterval: 20_000,
  });

  const setVaultId = useCallback((id: string) => {
    setVaultIdState(id);
    localStorage.setItem(VAULT_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['health'] }),
      queryClient.invalidateQueries({ queryKey: ['vaults'] }),
      ...(vaultId ? [queryClient.invalidateQueries({ queryKey: ['vault', vaultId] })] : []),
    ]);
  }, [queryClient, vaultId]);

  useEffect(() => {
    if (!vaultId) return;
    const unsubscribe = subscribeToVault(
      vaultId,
      (event) => {
        sequence.current += 1;
        setLastEvent({ ...event, receivedAt: Date.now(), sequence: sequence.current });

        window.clearTimeout(invalidationTimer.current);
        invalidationTimer.current = window.setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ['vault', vaultId] });
          void queryClient.invalidateQueries({ queryKey: ['vaults'] });
          if (event.event.startsWith('request')) {
            void queryClient.invalidateQueries({ queryKey: ['requests', vaultId] });
            void queryClient.invalidateQueries({ queryKey: ['request', vaultId] });
            void queryClient.invalidateQueries({ queryKey: ['approvals', vaultId] });
          }
          if (event.event === 'agent.updated') {
            void queryClient.invalidateQueries({ queryKey: ['agents', vaultId] });
            void queryClient.invalidateQueries({ queryKey: ['budget', vaultId] });
          }
          if (event.event.startsWith('harness')) {
            void queryClient.invalidateQueries({ queryKey: ['harnessRuns', vaultId] });
          }
        }, 300);
      },
      setStreamStatus,
    );
    return () => {
      unsubscribe();
      window.clearTimeout(invalidationTimer.current);
    };
  }, [vaultId, queryClient]);

  const value = useMemo<VaultContextValue>(
    () => ({
      vaultId,
      setVaultId,
      vaults,
      summary: summaryQuery.data,
      health: healthQuery.data,
      loading:
        healthQuery.isLoading || vaultsQuery.isLoading || (Boolean(vaultId) && summaryQuery.isLoading),
      error:
        (healthQuery.error as Error | null) ??
        (vaultsQuery.error as Error | null) ??
        (summaryQuery.error as Error | null),
      isLocal: (summaryQuery.data?.mode ?? healthQuery.data?.mode) === 'local',
      streamStatus,
      lastEvent,
      refresh,
    }),
    [
      vaultId,
      setVaultId,
      vaults,
      summaryQuery.data,
      healthQuery.data,
      healthQuery.isLoading,
      vaultsQuery.isLoading,
      vaultsQuery.error,
      summaryQuery.isLoading,
      summaryQuery.error,
      healthQuery.error,
      streamStatus,
      lastEvent,
      refresh,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault must be used inside <VaultProvider>');
  return value;
}
