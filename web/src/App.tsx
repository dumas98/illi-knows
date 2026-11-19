import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

type Status = 'checking' | 'up' | 'down';

export function App() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      .then(r => setStatus(r.ok ? 'up' : 'down'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('down');
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="hero">
      <p className="kicker">Illi-Knows</p>
      <h1>
        Know what&apos;s on before it&apos;s <span className="fly">over</span>
      </h1>
      <p className="lede">The new site is being built. The design mock in the repo shows where it&apos;s headed.</p>
      <p className="status" data-status={status}>
        API: {status === 'checking' ? 'checking…' : status === 'up' ? 'connected' : 'not reachable'}
      </p>
    </main>
  );
}
