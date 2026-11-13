import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Toaster, toast as sonner } from 'sonner';
import type { Tone } from '../lib/utils';

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

const TOAST_TYPE: Record<string, 'success' | 'error' | 'info' | 'warning'> = {
  green: 'success',
  red: 'error',
  amber: 'warning',
  blue: 'info',
  violet: 'info',
  slate: 'info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const type = TOAST_TYPE[toast.tone] ?? 'info';
    sonner[type](toast.title, { description: toast.description });
  }, []);

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
      <Toaster
        position="top-right"
        theme="light"
        expand
        visibleToasts={4}
        gap={8}
        toastOptions={{
          style: {
            background: '#ffffff',
            border: '1px solid #d7e1da',
            borderRadius: '12px',
            boxShadow: '0 4px 12px -2px rgba(19,30,23,0.08), 0 16px 40px -12px rgba(19,30,23,0.18)',
            color: '#131e17',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          },
        }}
        style={
          {
            // Sonner theme tokens, mapped onto the brand palette.
            '--normal-bg': '#ffffff',
            '--normal-border': '#d7e1da',
            '--normal-text': '#131e17',
            '--success-bg': '#ffffff',
            '--success-border': '#bbf7d0',
            '--success-text': '#15803d',
            '--error-bg': '#ffffff',
            '--error-border': '#fecdd3',
            '--error-text': '#be123c',
            '--warning-bg': '#ffffff',
            '--warning-border': '#fde68a',
            '--warning-text': '#b45309',
            '--info-bg': '#ffffff',
            '--info-border': '#d7e1da',
            '--info-text': '#37493d',
          } as React.CSSProperties
        }
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}
