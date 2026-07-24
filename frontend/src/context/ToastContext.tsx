import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastType = 'success' | 'error';

export type Toast = {
  id: string;
  message: string;
  type: ToastType;
  closing: boolean;
};

type ToastContextValue = {
  toasts: Toast[];
  showToast: (message: string, type: ToastType) => void;
  closeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const TOAST_VISIBLE_MS = 3400;
const TOAST_EXIT_MS = 320;

function createToastId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const closeToast = useCallback((id: string) => {
    setToasts(current => current.map(toast => (
      toast.id === id ? { ...toast, closing: true } : toast
    )));

    const removeTimer = setTimeout(() => removeToast(id), TOAST_EXIT_MS);
    timers.current.push(removeTimer);
  }, [removeToast]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = createToastId();

    setToasts(current => [
      ...current,
      { id, message, type, closing: false },
    ].slice(-4));

    const closeTimer = setTimeout(() => closeToast(id), TOAST_VISIBLE_MS);
    timers.current.push(closeTimer);
  }, [closeToast]);

  useEffect(() => () => {
    timers.current.forEach(timer => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({
    toasts,
    showToast,
    closeToast,
  }), [toasts, showToast, closeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}
