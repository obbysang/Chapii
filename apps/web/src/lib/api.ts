export const API = import.meta.env.VITE_API_URL as string | undefined ?? "http://localhost:3100";
export const NETWORK = (import.meta.env.VITE_NEAR_NETWORK as string | undefined) ?? "testnet";
export const DEMO_VAULT = (import.meta.env.VITE_DEMO_VAULT_ID as string | undefined) ?? "avfinal.testnet";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export function subscribeStream(
  vaultId: string,
  onEvent: (type: string, data: unknown) => void,
  onError?: (e: Event) => void
): () => void {
  const es = new EventSource(`${API}/vaults/${vaultId}/stream`);
  const handler = (e: MessageEvent) => {
    try {
      onEvent(e.type, JSON.parse(e.data as string));
    } catch {
      /* ignore malformed frames */
    }
  };
  for (const t of ["connected", "request.created", "request.updated", "agent.updated", "vault.updated"]) {
    es.addEventListener(t, handler as EventListener);
  }
  if (onError) es.onerror = onError;
  return () => es.close();
}

export function humanAmount(yocto: string): string {
  try {
    return (Number(BigInt(yocto)) / 1e24).toFixed(4);
  } catch {
    return yocto;
  }
}

export function shorten(s: string): string {
  return s.length <= 20 ? s : `${s.slice(0, 8)}…${s.slice(-6)}`;
}
