import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InsightsDTO, MeDTO, OrganizerEventDTO } from '@illi-knows/shared';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { campusMidnight, dayKey, addDaysKey } from '../lib/format';
import { EventForm } from '../pages/EventForm';
import { Insights } from '../pages/Insights';
import { Organize } from '../pages/Organize';
import { ToastProvider } from '../ToastProvider';

const me: MeDTO = {
  id: 'u1',
  name: 'Tess Ng',
  email: 'tess.ng@illinois.edu',
  roles: ['student', 'organizer'],
  preferences: { defaultReminder: 'none', rsvpAnonymously: false, emailReminders: true },
  organizations: [{ id: 'org1', name: 'Campus Radio', slug: 'campus-radio' }]
};
const auth = { status: 'signed-in', me, firebaseUser: null, error: null, busy: false, dialog: { open: false, title: '' }, openSignIn: vi.fn(), requireSignIn: vi.fn() } as unknown as AuthContextValue;

const inDays = (d: number, hours = 19) => new Date(campusMidnight(addDaysKey(dayKey(new Date()), d)).getTime() + hours * 3_600_000).toISOString();

function oe(id: string, title: string, day: number, extra: Partial<OrganizerEventDTO> = {}): OrganizerEventDTO {
  return {
    id,
    title,
    category: 'Music',
    startsAt: inDays(day),
    endsAt: inDays(day, 21),
    place: { id: 'p1', key: 'illini-union', name: 'Illini Union' },
    locationText: 'Illini Union, Room 210',
    locationDetail: 'Room 210',
    host: { name: 'Campus Radio', organizationId: 'org1' },
    price: { isFree: true, amountCents: null, note: null },
    source: { kind: 'organizer', handle: null },
    goingCount: 40,
    viewer: null,
    status: 'published',
    description: 'Six bands.',
    ended: day < 0,
    reviewNote: null,
    stats: { going: 40, anonymous: 3, checkedIn: 0, views: 300 },
    submittedAt: null,
    updatedAt: inDays(-3),
    editable: day >= 0,
    ...extra
  };
}

const EVENTS = [
  oe('e1', 'Battle of the bands', 4),
  oe('e2', 'Vinyl swap meet', 8, { status: 'in_review', stats: { going: 0, anonymous: 0, checkedIn: 0, views: 0 } }),
  oe('e3', 'Karaoke night', 10, { status: 'changes_requested', reviewNote: 'Add a location', place: null, locationText: '', locationDetail: null }),
  oe('e4', 'Songwriting workshop', 12, { status: 'draft' }),
  oe('e5', 'Fall showcase', -20, { stats: { going: 131, anonymous: 4, checkedIn: 96, views: 870 } })
];

type Handler = (url: URL, init?: RequestInit) => unknown;

function stub(handler: Handler) {
  const fetchMock = vi.fn((u: string, init?: RequestInit) => {
    const url = new URL(u, 'http://x');
    const body = handler(url, init);
    if (body instanceof Response) return Promise.resolve(body);
    if (body === undefined) return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const places = [
  { id: 'p1', key: 'illini-union', name: 'Illini Union', kind: 'building', center: [-88.227, 40.109], outline: null },
  { id: 'p2', key: 'main-quad', name: 'Main Quad', kind: 'quad', center: [-88.227, 40.107], outline: null }
];

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <ToastProvider>
          <AuthContext.Provider value={auth}>
            <Routes>
              <Route path="/organize" element={<Organize />} />
              <Route path="/organize/new" element={<EventForm />} />
              <Route path="/organize/:id/edit" element={<EventForm />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/insights/:id" element={<Insights />} />
            </Routes>
          </AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Manage events', () => {
  it('counts events by status and lists them with notes and actions', async () => {
    stub(url => (url.pathname === '/api/organizer/events' ? EVENTS : url.pathname === '/api/places' ? places : { layers: null }));
    renderAt('/organize');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your events' })).toBeTruthy());
    const tiles = (label: string) => screen.getByText(label, { selector: '.lab' }).parentElement!.querySelector('.num')!.textContent;
    expect(tiles('Published')).toBe('1');
    expect(tiles('In review')).toBe('1');
    expect(tiles('Needs changes')).toBe('1');
    expect(tiles('Drafts')).toBe('1');

    const table = screen.getByRole('table');
    expect(within(table).getByText('Reviewer note: Add a location')).toBeTruthy();
    expect(within(table).getByText('Past')).toBeTruthy();
    expect(within(table).queryByRole('link', { name: 'Edit Fall showcase' })).toBeNull();
    expect(within(table).getByRole('link', { name: 'Insights for Battle of the bands' })).toBeTruthy();
    expect(screen.getByText('Karaoke night has no campus location yet.')).toBeTruthy();
  });

  it('asks before deleting and then deletes', async () => {
    const fetchMock = stub(url => (url.pathname === '/api/organizer/events' ? EVENTS : url.pathname === '/api/places' ? places : undefined));
    renderAt('/organize');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Battle of the bands' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Battle of the bands' }));
    expect(screen.getByText(/40 people lose their RSVP/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).endsWith('/api/organizer/events/e1') && i?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.getByText('Battle of the bands deleted')).toBeTruthy());
  });
});

describe('Create and edit', () => {
  it('checks the form, then sends it for review with the matched place', async () => {
    let sent: Record<string, unknown> | null = null;
    stub((url, init) => {
      if (url.pathname === '/api/places') return places;
      if (url.pathname === '/api/organizer/events' && init?.method === 'POST') {
        sent = JSON.parse(String(init.body)) as Record<string, unknown>;
        return oe('new', String(sent.title), 7, { status: 'in_review' });
      }
      return [];
    });
    renderAt('/organize/new');
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(screen.getByText('Enter an event name.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Radio open house' } });
    await waitFor(() => expect(document.querySelectorAll('datalist option').length).toBe(2));
    fireEvent.change(screen.getByLabelText('Campus place'), { target: { value: 'the moon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(screen.getByText(/Pick a place from the list/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Campus place'), { target: { value: 'main quad' } });
    fireEvent.change(screen.getByLabelText('Room or spot (optional)'), { target: { value: 'North lawn' } });
    fireEvent.click(screen.getByLabelText('Free to attend'));
    fireEvent.change(screen.getByLabelText('Price in dollars'), { target: { value: '4.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      title: 'Radio open house',
      placeKey: 'main-quad',
      locationDetail: 'North lawn',
      organizationId: 'org1',
      isFree: false,
      priceDollars: 4.5,
      submit: true
    });
  });

  it('shows the API’s field errors next to the fields', async () => {
    stub((url, init) => {
      if (url.pathname === '/api/places') return places;
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ error: { code: 'invalid_request', message: 'Bad', details: { date: ['Pick a date and time in the future.'] } } }), { status: 400 });
      }
      return [];
    });
    renderAt('/organize/new');
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Old news' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByText('Pick a date and time in the future.')).toBeTruthy());
    expect(screen.getByLabelText('Date').getAttribute('aria-invalid')).toBe('true');
  });

  it('warns before editing a live event and fills in its details', async () => {
    stub(url => (url.pathname === '/api/organizer/events/e1' ? EVENTS[0] : url.pathname === '/api/places' ? places : []));
    renderAt('/organize/e1/edit');
    await waitFor(() => expect(screen.getByDisplayValue('Battle of the bands')).toBeTruthy());
    expect(screen.getByText(/This event is live. Saving sends it back to review/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe('19:00');
    expect((screen.getByLabelText('Ends') as HTMLInputElement).value).toBe('21:00');
    expect((screen.getByLabelText('Campus place') as HTMLInputElement).value).toBe('Illini Union');
    expect((screen.getByLabelText('Room or spot (optional)') as HTMLInputElement).value).toBe('Room 210');
  });
});

describe('Insights', () => {
  it('shows tiles and charts for the chosen event', async () => {
    const data: InsightsDTO = {
      event: EVENTS[4]!,
      rsvpsByDay: Array.from({ length: 14 }, (_, i) => ({ daysBefore: 13 - i, count: i })),
      earlier: 40,
      foundVia: [
        { label: 'Instagram', value: 60 },
        { label: 'Friends', value: 71 }
      ],
      past: [{ id: 'e5', title: 'Fall showcase', startsAt: EVENTS[4]!.startsAt, going: 131, checkedIn: 96 }]
    };
    stub(url => (url.pathname === '/api/organizer/events' ? EVENTS : url.pathname.endsWith('/insights') ? data : []));
    renderAt('/insights/e5');
    await waitFor(() => expect(screen.getByText('RSVPs in the two weeks before the event')).toBeTruthy());
    expect(screen.getByText('73%')).toBeTruthy();
    expect(screen.getByText(/40 more RSVPed earlier than that/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /How people found this event: Instagram 60, Friends 71/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Fall showcase, 131 RSVPs, 96 checked in/ })).toBeTruthy();
    expect((screen.getByLabelText('Event') as HTMLSelectElement).value).toBe('e5');
  });
});
