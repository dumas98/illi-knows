import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORIES, SOURCE_KINDS, SOURCE_LABELS, type Category, type EventsQuery, type SourceKind } from '@illi-knows/shared';
import { DayList } from '../components/DayList';
import { EventMapList } from '../components/EventMapList';
import { LoadState } from '../components/LoadState';
import { WeekGrid } from '../components/WeekGrid';
import { addDaysKey, campusMidnight, dayKey, weekLabel, weekStartKey } from '../lib/format';
import { WHENS, whenRange } from '../lib/when';
import { useAllEvents, useEventPages, usePlaces } from '../queries';
import { usePageTitle } from '../lib/usePageTitle';

const VIEWS = [
  ['list', 'List'],
  ['week', 'Week'],
  ['map', 'Map']
] as const;

const pick = <T extends string>(options: readonly T[], v: string | null, fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const iso = (key: string) => campusMidnight(key).toISOString();

export function Discover() {
  usePageTitle('Discover events');
  const [params, setParams] = useSearchParams();
  const [today] = useState(() => dayKey(new Date()));
  const view = pick(VIEWS.map(v => v[0]), params.get('view'), 'list');
  const when = pick(WHENS.map(w => w[0]), params.get('when'), '');
  const q = params.get('q') ?? '';
  const category = pick<Category | ''>(['', ...CATEGORIES], params.get('category'), '') || undefined;
  const source = pick<SourceKind | ''>(['', ...SOURCE_KINDS], params.get('source'), '') || undefined;
  const free = params.get('free') === '1';
  const weekParam = params.get('week');
  const week = weekStartKey(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today);
  const thisWeek = weekStartKey(today);

  const [draft, setDraft] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
  }

  const set = (changes: Record<string, string | undefined>, replace = false) =>
    setParams(
      p => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace }
    );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (draft.trim() === q) return;
      setParams(
        p => {
          const next = new URLSearchParams(p);
          if (draft.trim()) next.set('q', draft.trim());
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft, q, setParams]);

  const base: EventsQuery = { q: q || undefined, category, source, free: free || undefined };
  const range = whenRange(when, today);
  const ranged: EventsQuery = range ? { ...base, from: iso(range.from), to: iso(range.to) } : base;

  const places = usePlaces();
  const list = useEventPages({ ...ranged, limit: 50 }, view === 'list');
  const map = useAllEvents(ranged, view === 'map');
  const weekEvents = useAllEvents({ ...base, from: iso(week), to: iso(addDaysKey(week, 7)), includePast: true }, view === 'week');

  const filtered = !!(q || category || source || free || when);
  const clear = () => {
    setDraft('');
    set({ q: undefined, category: undefined, source: undefined, free: undefined, when: undefined });
  };

  const noMatch = (
    <div className="panel empty stack">
      <h3>No events match those filters</h3>
      <p className="muted">Try a different day or category, or clear the filters to see everything.</p>
      {filtered && (
        <button className="btn btn-primary" type="button" onClick={clear}>
          Clear filters
        </button>
      )}
    </div>
  );

  const stale = (view === 'list' ? list : view === 'map' ? map : weekEvents).isPlaceholderData;
  let count = '';
  let results: ReactNode;
  if (view === 'list') {
    const items = list.data?.pages.flatMap(p => p.items) ?? [];
    if (list.data && !list.isPlaceholderData) count = list.hasNextPage ? `First ${items.length} events` : plural(items.length, 'event');
    results = (
      <LoadState query={list} empty={false} emptyText="">
        {items.length === 0 ? (
          noMatch
        ) : (
          <>
            <DayList events={items} />
            {list.hasNextPage && (
              <div className="row center">
                <button className="btn" type="button" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                  {list.isFetchingNextPage ? 'Loading…' : 'Show more events'}
                </button>
              </div>
            )}
          </>
        )}
      </LoadState>
    );
  } else if (view === 'map') {
    const items = map.data?.items ?? [];
    if (map.data && !map.isPlaceholderData) count = plural(items.length, 'event');
    results = (
      <LoadState query={map} empty={false} emptyText="">
        {items.length === 0 ? noMatch : <EventMapList events={items} places={places.data ?? []} />}
      </LoadState>
    );
  } else {
    const items = weekEvents.data?.items ?? [];
    if (weekEvents.data && !weekEvents.isPlaceholderData) count = `${plural(items.length, 'event')} ${week === thisWeek ? 'this week' : 'that week'}`;
    results = (
      <LoadState query={weekEvents} empty={false} emptyText="">
        <WeekGrid start={week} today={today} events={weekEvents.isPlaceholderData ? [] : items} loading={weekEvents.isPlaceholderData} />
      </LoadState>
    );
  }

  return (
    <section className="discover">
      <div className="row between">
        <h1>Discover events</h1>
        <div className="seg" role="group" aria-label="Layout">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => set({ view: v === 'list' ? undefined : v })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="filters">
        <div className="grow">
          <label htmlFor="discover-q" className="sr">
            Search
          </label>
          <input id="discover-q" type="search" placeholder="Search events, clubs, places" value={draft} onChange={e => setDraft(e.target.value)} />
        </div>
        <label htmlFor="discover-source" className="sr">
          Found on
        </label>
        <select id="discover-source" value={source ?? ''} onChange={e => set({ source: e.target.value || undefined })}>
          <option value="">All sources</option>
          {SOURCE_KINDS.map(s => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={free} onChange={e => set({ free: e.target.checked ? '1' : undefined })} /> Free only
        </label>
        {filtered && (
          <button className="btn btn-sm" type="button" onClick={clear}>
            Clear filters
          </button>
        )}
      </div>

      <div className="chips" role="group" aria-label="Category">
        <button type="button" className="chip" aria-pressed={!category} onClick={() => set({ category: undefined })}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => set({ category: c })}>
            {c}
          </button>
        ))}
      </div>

      <div className="row between">
        {view === 'week' ? (
          <div className="weeknav">
            <button className="btn btn-sm" type="button" aria-label="Previous week" onClick={() => set({ week: addDaysKey(week, -7) })}>
              ‹
            </button>
            <span className="wk-label" aria-live="polite">
              {weekLabel(week)}
            </span>
            <button className="btn btn-sm" type="button" aria-label="Next week" onClick={() => set({ week: addDaysKey(week, 7) })}>
              ›
            </button>
            {week !== thisWeek && (
              <button className="btn btn-sm wide" type="button" onClick={() => set({ week: undefined })}>
                This week
              </button>
            )}
          </div>
        ) : (
          <div className="chips" role="group" aria-label="When">
            {WHENS.map(([w, label]) => (
              <button key={w || 'any'} type="button" className="chip" aria-pressed={when === w} onClick={() => set({ when: w || undefined })}>
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="count" aria-live="polite">
          {count}
        </p>
      </div>

      <div className={stale ? 'stale' : undefined} aria-busy={stale}>
        {results}
      </div>
      {view === 'map' && map.data?.truncated && <p className="hint">Showing the first 500 events. Narrow the filters to see the rest.</p>}
    </section>
  );
}
