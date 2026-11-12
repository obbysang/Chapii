import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Copy, Inbox, Loader2, X } from 'lucide-react';
import { cn, TONE_CLASS, copyText, requestLabel, requestTone, reasonTone, type Tone } from '../lib/utils';
import { reasonLabel } from '@agentvault/shared';
import type { AgentStatus, ReasonCode, RequestStatus } from '@agentvault/shared';

export function Panel({
  children,
  className,
  soft = false,
}: {
  children: ReactNode;
  className?: string;
  soft?: boolean;
}) {
  return <div className={cn(soft ? 'panel-soft' : 'panel', className)}>{children}</div>;
}

export function SectionTitle({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-400/80">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'slate',
  dot = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('chip', TONE_CLASS[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function AgentStatusBadge({ status }: { status: AgentStatus | string }) {
  const tone: Tone = status === 'ACTIVE' ? 'green' : status === 'FROZEN' ? 'amber' : 'red';
  return (
    <Badge tone={tone} dot>
      {status.toLowerCase()}
    </Badge>
  );
}

export function RequestStatusBadge({ status }: { status: RequestStatus | string }) {
  return (
    <Badge tone={requestTone(status)} dot>
      {requestLabel(status)}
    </Badge>
  );
}

export function ReasonBadge({ reason }: { reason: ReasonCode | string | null | undefined }) {
  if (!reason) return null;
  return (
    <span
      className={cn(
        'chip max-w-full truncate font-mono text-[11px]',
        TONE_CLASS[reasonTone(reason)],
      )}
      title={reasonLabel(reason)}
    >
      {reason}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin text-slate-400', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-slate-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'slate',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className="panel-soft p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {icon ? <span className={cn('text-slate-400', tone === 'green' && 'text-emerald-400', tone === 'red' && 'text-rose-400', tone === 'amber' && 'text-amber-400', tone === 'blue' && 'text-sky-400')}>{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  tone = 'blue',
  className,
}: {
  value: number;
  tone?: 'blue' | 'green' | 'red' | 'amber';
  className?: string;
}) {
  const colors = {
    blue: 'bg-sky-400',
    green: 'bg-emerald-400',
    red: 'bg-rose-400',
    amber: 'bg-amber-400',
  } as const;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', colors[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function CopyButton({
  value,
  label,
  className,
  compact = false,
}: {
  value: string;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={label ? `Copy ${label}` : 'Copy'}
      onClick={() => {
        void copyText(value).then((ok) => {
          if (!ok) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] text-xs text-slate-400 transition hover:border-white/20 hover:text-slate-200',
        compact ? 'p-1.5' : 'px-2 py-1',
        className,
      )}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {compact ? null : <span>{copied ? 'Copied' : (label ?? 'Copy')}</span>}
    </button>
  );
}

export function Button({
  variant = 'default',
  loading = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cn(
        variant === 'primary' && 'btn-primary',
        variant === 'danger' && 'btn-danger',
        variant === 'ghost' && 'btn-ghost',
        variant === 'default' && 'btn',
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={cn('input appearance-none pr-9', props.className)} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input min-h-[84px] resize-y', props.className)} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:bg-white/[0.04]"
    >
      <span>
        <span className="block text-sm font-medium text-slate-200">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition',
          checked ? 'border-sky-400/50 bg-sky-500/80' : 'border-white/10 bg-white/10',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
          style={{ height: 18, width: 18 }}
        />
      </span>
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'panel max-h-[90vh] w-full overflow-y-auto p-5 fade-in',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 id={titleId} className="text-base font-semibold text-slate-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 transition hover:text-slate-200"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: ReactNode; count?: number }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
            value === tab.id
              ? 'bg-white/[0.08] text-slate-100'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] text-slate-400">
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/[0.05] py-2.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cn('min-w-0 text-sm text-slate-200 sm:text-right', mono && 'mono break-all')}>
        {children}
      </dd>
    </div>
  );
}
