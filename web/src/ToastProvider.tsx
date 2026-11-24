import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastAction } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setToast({ message, action });
    timer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div id="toast" role="status" aria-live="polite" hidden={!toast}>
        <span>{toast?.message}</span>
        {toast?.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              setToast(null);
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
}
