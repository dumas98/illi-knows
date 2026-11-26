import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSummaryDTO } from '@illi-knows/shared';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { addDaysKey, campusMidnight, campusMinutes, dayKey, weekStartKey, weekLabel } from '../lib/format';
import { whenRange } from '../lib/when';
import { layoutDay } from '../lib/weekLayout';
import { Discover } from '../pages/Discover';

const guest = { status: 'guest', me: null, firebaseUser: null, error: null, busy: false, dialog: { open: false, title: '' } } as unknown as AuthContextValue;

function event(id: string, title: string, startsAt: string, hours = 2, extra: Partial<EventSummaryDTO> = {}): EventSummaryDTO {
  return {
    id,
    title,
    category: 'Music',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + hours * 3_600_000).toISOString(),
    place: null,
    locationText: 'Illini Union',
    locationDetail: null,
    host: { name: 'Campus Radio', organizationId: null },
    price: { isFree: true, amountCents: null, note: null },
    source: { kind: 'organizer', handle: null },
    goingCount: 12,
    viewer: null,
    ...extra
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('campus calendar math', () => {
  it('finds campus midnight on both sides of the daylight saving change', () => {
    expect(campusMidnight('2026-10-31').toISOString()).toBe('2026-10-31T05:00:00.000Z');
    expect(campusMidnight('2026-11-02').toISOString()).toBe('2026-11-02T06:00:00.000Z');
    expect(campusMidnight('2026-03-08').toISOString()).toBe('2026-03-08T06:00:00.000Z');
    expect(dayKey(campusMidnight('2026-11-25'))).toBe('2026-11-25');
    expect(campusMinutes('2026-11-25T20:30:00.000Z')).toBe(14 * 60 + 30);
  });

  it('starts weeks on Monday and labels them', () => {
    expect(weekStartKey('2026-11-25')).toBe('2026-11-23');
    expect(weekStartKey('2026-11-29')).toBe('2026-11-23');
    expect(weekStartKey('2026-11-30')).toBe('2026-11-30');
    expect(addDaysKey('2026-12-30', 3)).toBe('2027-01-02');
    expect(weekLabel('2026-11-23')).toBe('Nov 23 to 29');
    expect(weekLabel('2026-11-30')).toBe('Nov 30 to Dec 6');
  });

  it('turns the when chips into day ranges', () => {
    expect(whenRange('', '2026-11-25')).toBeNull();
    expect(whenRange('today', '2026-11-25')).toEqual({ from: '2026-11-25', to: '2026-11-26' });
    expect(whenRange('this-week', '2026-11-25')).toEqual({ from: '2026-11-25', to: '2026-11-30' });
    expect(whenRange('weekend', '2026-11-25')).toEqual({ from: '2026-11-28', to: '2026-11-30' });
    expect(whenRange('weekend', '2026-11-29')).toEqual({ from: '2026-11-29', to: '2026-11-30' });
    expect(whenRange('next-week', '2026-11-25')).toEqual({ from: '2026-11-30', to: '2026-12-07' });
  });

  it('puts overlapping events side by side in the week grid', () => {
    const { placed, lanes } = layoutDay([
      event('a', 'A', '2026-11-25T20:00:00.000Z'),
      event('b', 'B', '2026-11-25T21:00:00.000Z'),
      event('c', 'C', '2026-11-25T23:30:00.000Z'),
      event('d', 'D', '2026-11-25T09:00:00.000Z')
    ]);
    expect(lanes).toBe(2);
    expect(Object.fromEntries(placed.map(p => [p.event.id, p.lane]))).toEqual({ d: 0, a: 0, b: 1, c: 0 });
    expect(placed.find(p => p.event.id === 'd')!.start).toBe(8 * 60);
  });
});

function renderDiscover(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <AuthContext.Provider value={guest}>
          <Routes>
            <Route path="/discover" element={<Discover />} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function stubApi(items: EventSummaryDTO[], nextCursor: string | null = null) {
  const fetchMock = vi.fn((url: string) => {
    const body = url.includes('/api/events') ? { items, nextCursor } : url.includes('basemap') ? { layers: null } : [];
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const eventCalls = (m: ReturnType<typeof stubApi>) => m.mock.calls.map(([u]) => new URL(u, 'http://x')).filter(u => u.pathname === '/api/events');

describe('Discover page', () => {
  const soon = new Date(Date.now() + 26 * 3_600_000).toISOString();

  it('groups the list by day and sends the When and filter choices to the API', async () => {
    const fetchMock = stubApi([event('e1', 'Open mic night', soon)], 'next');
    renderDiscover('/discover?category=Music&free=1');
    await waitFor(() => expect(screen.getByText('Open mic night')).toBeTruthy());
    expect(screen.getByRole('heading', { level: 2, name: /Tomorrow/ })).toBeTruthy();
    expect(screen.getByText('First 1 events')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show more events' })).toBeTruthy();
    let last = eventCalls(fetchMock).at(-1)!;
    expect(last.searchParams.get('category')).toBe('Music');
    expect(last.searchParams.get('free')).toBe('true');
    expect(last.searchParams.get('from')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(eventCalls(fetchMock).at(-1)!.searchParams.get('from')).not.toBeNull());
    last = eventCalls(fetchMock).at(-1)!;
    const today = dayKey(new Date());
    expect(last.searchParams.get('from')).toBe(campusMidnight(today).toISOString());
    expect(last.searchParams.get('to')).toBe(campusMidnight(addDaysKey(today, 1)).toISOString());

    fireEvent.change(screen.getByLabelText('Found on'), { target: { value: 'instagram' } });
    await waitFor(() => expect(eventCalls(fetchMock).at(-1)!.searchParams.get('source')).toBe('instagram'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(eventCalls(fetchMock).at(-1)!.search).toBe('?limit=50'));
  });

  it('shows a clear-filters prompt when nothing matches', async () => {
    stubApi([]);
    renderDiscover('/discover?category=Food');
    await waitFor(() => expect(screen.getByText('No events match those filters')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2);
  });

  it('draws the week grid, includes earlier days, and moves between weeks', async () => {
    const monday = weekStartKey(dayKey(new Date()));
    const tuesdayNoon = new Date(campusMidnight(addDaysKey(monday, 1)).getTime() + 12 * 3_600_000).toISOString();
    const fetchMock = stubApi([event('w1', 'Jazz combo recital', tuesdayNoon, 2, { viewer: { going: true, anonymous: false, inCalendar: false, reminder: 'none' } })]);
    renderDiscover('/discover?view=week');
    await waitFor(() => expect(screen.getByRole('link', { name: /Jazz combo recital, .* at 12:00 pm, you’re going/ })).toBeTruthy());
    expect(screen.getByText('1 event this week')).toBeTruthy();
    expect(screen.getByText(weekLabel(monday))).toBeTruthy();
    const call = eventCalls(fetchMock).at(-1)!;
    expect(call.searchParams.get('includePast')).toBe('true');
    expect(call.searchParams.get('from')).toBe(campusMidnight(monday).toISOString());
    expect(call.searchParams.get('to')).toBe(campusMidnight(addDaysKey(monday, 7)).toISOString());

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(screen.getByText(weekLabel(addDaysKey(monday, 7)))).toBeTruthy());
    expect(screen.getByRole('button', { name: 'This week' })).toBeTruthy();
    await waitFor(() => expect(eventCalls(fetchMock).at(-1)!.searchParams.get('from')).toBe(campusMidnight(addDaysKey(monday, 7)).toISOString()));
  });

  it('switches to the map view with numbered rows', async () => {
    stubApi([event('m1', 'Late-night pancake study break', soon)]);
    renderDiscover('/discover');
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Map', pressed: true })).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Numbers match the list/)).toBeTruthy());
    expect(screen.getByText('Late-night pancake study break')).toBeTruthy();
  });
});
