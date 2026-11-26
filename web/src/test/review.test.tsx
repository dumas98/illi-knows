import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDTO, ReviewItemDTO, ReviewQueueDTO, SourceSummaryDTO } from '@illi-knows/shared';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { TipForm } from '../pages/EventForm';
import { Review } from '../pages/Review';
import { ToastProvider } from '../ToastProvider';

const admin: MeDTO = {
  id: 'a1',
  name: 'Sam Admin',
  email: 'sam.admin@illinois.edu',
  roles: ['student', 'admin'],
  preferences: { defaultReminder: 'none', rsvpAnonymously: false, emailReminders: true },
  organizations: []
};
const authFor = (me: MeDTO) => ({ status: 'signed-in', me, firebaseUser: null, error: null, busy: false, dialog: { open: false, title: '' }, openSignIn: vi.fn() }) as unknown as AuthContextValue;

const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
function item(id: string, title: string, extra: Partial<ReviewItemDTO> = {}): ReviewItemDTO {
  return {
    id,
    title,
    category: 'Music',
    startsAt: soon,
    endsAt: new Date(Date.parse(soon) + 7_200_000).toISOString(),
    place: null,
    locationText: 'Union courtyard',
    locationDetail: null,
    host: { name: 'Acoustic Club', organizationId: null },
    price: { isFree: true, amountCents: null, note: null },
    source: { kind: 'instagram', handle: '@acousticclub' },
    goingCount: 0,
    viewer: null,
    status: 'in_review',
    description: 'open mic this friday!!',
    ended: false,
    reviewNote: null,
    stats: { going: 0, anonymous: 0, checkedIn: 0, views: 0 },
    submittedAt: soon,
    updatedAt: soon,
    editable: true,
    from: 'Instagram, @acousticclub',
    flags: [],
    lastDecision: null,
    ...extra
  };
}

const QUEUE: ReviewQueueDTO = {
  tab: 'pending',
  items: [
    item('q1', 'Open mic nite', { flags: [{ code: 'possible_duplicate', message: 'Possible duplicate of Open mic night', relatedEvent: { id: 'e9', title: 'Open mic night' } }] }),
    item('q2', 'Yoga on the quad', { from: 'Event board, Campus events calendar', source: { kind: 'event_board', handle: null } })
  ],
  counts: { pending: 2, approved: 5, changes_requested: 1, rejected: 0 }
};
const SOURCES: SourceSummaryDTO[] = [
  { kind: 'event_board', label: 'Event boards', mode: 'automatic', sources: 2, syncEveryMinutes: 30, lastRunAt: new Date(Date.now() - 12 * 60_000).toISOString(), newListings: 2, pending: 1, error: null },
  { kind: 'instagram', label: 'Instagram accounts', mode: 'manual', sources: 5, syncEveryMinutes: null, lastRunAt: null, newListings: 0, pending: 1, error: null },
  { kind: 'word_of_mouth', label: 'Word of mouth', mode: 'manual', sources: 1, syncEveryMinutes: null, lastRunAt: null, newListings: 0, pending: 0, error: null }
];

function stub(onPost?: (url: string, body: unknown) => unknown) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((u: string, init?: RequestInit) => {
      const url = new URL(u, 'http://x');
      let body: unknown = [];
      if (init?.method === 'POST') {
        const sent = JSON.parse(String(init.body)) as unknown;
        calls.push({ url: url.pathname, body: sent });
        body = onPost?.(url.pathname, sent);
      } else if (url.pathname === '/api/review/queue') body = QUEUE;
      else if (url.pathname === '/api/review/sources') body = SOURCES;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    })
  );
  return calls;
}

function renderAt(url: string, me: MeDTO = admin) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <ToastProvider>
          <AuthContext.Provider value={authFor(me)}>
            <Routes>
              <Route path="/review" element={<Review />} />
              <Route path="/review/tip" element={<TipForm />} />
            </Routes>
          </AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Review queue', () => {
  it('keeps non-admins out', () => {
    stub();
    renderAt('/review', { ...admin, roles: ['student'] });
    expect(screen.getByText(/Only admins can review listings/)).toBeTruthy();
  });

  it('shows sources, tab counts, and what to check on each listing', async () => {
    stub();
    renderAt('/review');
    await waitFor(() => expect(screen.getByRole('article', { name: 'Open mic nite' })).toBeTruthy());
    expect(screen.getByText(/Runs every 30 minutes. Last sync 12 minutes ago, 2 new listings./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pending (2)', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approved (5)' })).toBeTruthy();
    const row = screen.getByRole('article', { name: 'Open mic nite' });
    expect(within(row).getByText(/Check: Possible duplicate of Open mic night/)).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'open it' }).getAttribute('href')).toBe('/events/e9');
    expect(within(screen.getByRole('article', { name: 'Yoga on the quad' })).getByText('No issues found')).toBeTruthy();
  });

  it('approves with Undo, and asks what to change before requesting changes', async () => {
    const calls = stub((_url, body) => item('q1', 'Open mic nite', { status: (body as { action: string }).action === 'approve' ? 'published' : 'changes_requested' }));
    renderAt('/review');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve Open mic nite' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Approve Open mic nite' }));
    await waitFor(() => expect(screen.getByText('Open mic nite approved and published')).toBeTruthy());
    expect(calls[0]).toEqual({ url: '/api/review/events/q1/decision', body: { action: 'approve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(calls[1]).toEqual({ url: '/api/review/events/q1/decision', body: { action: 'reopen' } }));

    fireEvent.click(screen.getByRole('button', { name: 'Request changes to Yoga on the quad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByText('Tell the organizer what to change.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What should they change?'), { target: { value: 'Add the lawn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(calls[2]).toEqual({ url: '/api/review/events/q2/decision', body: { action: 'request_changes', note: 'Add the lawn' } }));
  });
});

describe('Word-of-mouth tips', () => {
  it('sends a tip with a typed host to the review queue', async () => {
    const calls = stub((_url, body) => item('t1', (body as { title: string }).title));
    renderAt('/review/tip');
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Lantern walk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to review queue' }));
    expect(screen.getByText('Enter who is hosting it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Hosted by'), { target: { value: 'Lantern Society' } });
    fireEvent.click(screen.getByLabelText('Not on the campus map'));
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Behind the Union' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to review queue' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe('/api/review/tips');
    expect(calls[0]!.body).toMatchObject({ title: 'Lantern walk', hostName: 'Lantern Society', placeKey: null, locationText: 'Behind the Union' });
    expect(calls[0]!.body).not.toHaveProperty('organizationId');
    expect(calls[0]!.body).not.toHaveProperty('submit');
  });
});
