import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMessage(text);
    timer.current = window.setTimeout(() => setMessage(null), 3500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div id="toast" role="status" aria-live="polite" hidden={!message}>
        {message}
      </div>
    </ToastContext.Provider>
  );
}
