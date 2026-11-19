import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORIES, type Category } from '@illi-knows/shared';
import { EventMapList } from '../components/EventMapList';
import { LoadState } from '../components/LoadState';
import { useEvents, usePlaces } from '../queries';

function asCategory(v: string | null): Category | undefined {
  return (CATEGORIES as readonly string[]).includes(v ?? '') ? (v as Category) : undefined;
}

export function Discover() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = asCategory(params.get('category'));
  const [draft, setDraft] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  const places = usePlaces();
  const events = useEvents({ q: q || undefined, category, limit: 100 });
  const items = events.data?.items ?? [];

  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (draft.trim() === q) return;
      setParams(p => {
        const next = new URLSearchParams(p);
        if (draft.trim()) next.set('q', draft.trim());
        else next.delete('q');
        return next;
      }, { replace: true });
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft, q, setParams]);

  const setCategory = (c: Category | undefined) =>
    setParams(p => {
      const next = new URLSearchParams(p);
      if (c) next.set('category', c);
      else next.delete('category');
      return next;
    });

  return (
    <section>
      <h1>Discover events</h1>
      <div className="filters">
        <div className="grow">
          <label htmlFor="discover-q" className="sr">
            Search
          </label>
          <input id="discover-q" type="search" placeholder="Search events, clubs, places" value={draft} onChange={e => setDraft(e.target.value)} />
        </div>
        {(q || category) && (
          <button className="btn btn-sm" type="button" onClick={() => setParams({})}>
            Clear filters
          </button>
        )}
      </div>
      <div className="chips" aria-label="Category">
        <button type="button" className="chip" aria-pressed={!category} onClick={() => setCategory(undefined)}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <p className="count" aria-live="polite">
        {events.data ? `${items.length} upcoming ${items.length === 1 ? 'event' : 'events'}` : ''}
      </p>
      <LoadState query={events} empty={items.length === 0} emptyText="No events match those filters. Try a different category or clear the search.">
        <EventMapList events={items} places={places.data ?? []} />
      </LoadState>
      <p className="hint">The list, week, and map views from the design arrive in the next update.</p>
    </section>
  );
}
