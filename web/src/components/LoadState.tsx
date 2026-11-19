import { useEffect, useState, type ReactNode } from 'react';

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function LoadState({ query, empty, emptyText, children }: { query: QueryLike; empty: boolean; emptyText: string; children: ReactNode }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!query.isPending) return;
    const t = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(t);
  }, [query.isPending]);

  if (query.isPending) {
    return (
      <div className="skeleton" role="status">
        Loading events…{slow && ' The server sleeps when nobody has visited for a while, so this can take up to 30 seconds.'}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="panel empty stack" role="alert">
        <h3>Couldn&apos;t load events</h3>
        <p className="muted">{query.error instanceof Error ? query.error.message : 'Something went wrong.'}</p>
        <button className="btn btn-primary" type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="panel empty stack">
        <p className="muted">{emptyText}</p>
      </div>
    );
  }
  return <>{children}</>;
}
