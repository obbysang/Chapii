import type { ReactNode } from "react";

export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div role="status" className="animate-pulse" aria-label={text}>
      <div className="h-6 w-48 rounded bg-[#1d2430]" />
      <div className="mt-3 h-4 w-96 rounded bg-[#1d2430]" />
      <div className="mt-2 h-4 w-80 rounded bg-[#1d2430]" />
      <p className="mt-3 text-sm text-[#98a2b3]">{text}</p>
    </div>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#262c38] bg-[#151920] p-6 text-center">
      <p className="font-medium">{title}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-lg border border-[#e26a6a] bg-[#151920] p-4" role="alert">
      <p className="text-[#e26a6a]">Something went wrong</p>
      <p className="mt-1 text-sm text-[#98a2b3]">{message}</p>
      {retry ? (
        <button className="mt-3 rounded border border-[#262c38] px-4 py-2" onClick={retry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("COMPLETED") || s.includes("APPROVED")) return "var(--green)";
  if (s.includes("PENDING") || s.includes("AWAITING") || s.includes("EXECUTING") || s.includes("QUEUED")) return "var(--amber)";
  if (s.includes("REJECT") || s.includes("FAIL") || s.includes("EXPIRED") || s.includes("ERROR")) return "var(--red)";
  if (s.includes("FROZEN") || s.includes("REVOKED")) return "#6b7280";
  return "var(--blue)";
}

export function asText(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}
