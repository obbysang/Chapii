import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';
import { cn, type Tone } from '../lib/utils';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: Tone;
}

interface ToastApi {
  push: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  green: CheckCircle2,
  amber: TriangleAlert,
  red: XCircle,
  blue: Info,
  violet: Info,
  slate: Info,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => remove(id), 5200);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, description) => push({ title, description, tone: 'green' }),
      error: (title, description) => push({ title, description, tone: 'red' }),
      info: (title, description) => push({ title, description, tone: 'blue' }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-card backdrop-blur-xl fade-in',
                toast.tone === 'green' && 'border-emerald-400/30 bg-emerald-950/70',
                toast.tone === 'red' && 'border-rose-400/30 bg-rose-950/70',
                toast.tone === 'amber' && 'border-amber-400/30 bg-amber-950/70',
                (toast.tone === 'blue' || toast.tone === 'violet' || toast.tone === 'slate') &&
                  'border-sky-400/25 bg-slate-950/80',
              )}
            >
              <Icon
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  toast.tone === 'green' && 'text-emerald-300',
                  toast.tone === 'red' && 'text-rose-300',
                  toast.tone === 'amber' && 'text-amber-300',
                  (toast.tone === 'blue' || toast.tone === 'violet' || toast.tone === 'slate') &&
                    'text-sky-300',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-400">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => remove(toast.id)}
                className="rounded p-0.5 text-slate-500 transition hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
