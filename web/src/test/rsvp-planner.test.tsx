import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { EventDetailDTO, EventSummaryDTO, MeDTO, PlannerDTO } from '@illi-knows/shared';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { EventPage, RsvpPanel } from '../pages/EventPage';
import { PlannerBody } from '../pages/Planner';
import { ToastProvider } from '../ToastProvider';

const me: MeDTO = {
  id: 'u1',
  name: 'Pat Lee',
  email: 'pat.lee@illinois.edu',
  roles: ['student'],
  preferences: { defaultReminder: 'none', rsvpAnonymously: false, emailReminders: true },
  organizations: []
};

function authValue(signedIn: boolean, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: signedIn ? 'signed-in' : 'guest',
    firebaseUser: null,
    me: signedIn ? me : null,
    error: null,
    busy: false,
    dialog: { open: false, title: '' },
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    createAccount: vi.fn(),
    resendVerification: vi.fn(),
    checkVerification: vi.fn(),
    signOut: vi.fn(),
    requireSignIn: vi.fn(),
    openSignIn: vi.fn(),
    closeDialog: vi.fn(),
    clearError: vi.fn(),
    ...overrides
  };
}

function wrap(ui: ReactNode, auth: AuthContextValue) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const inDays = (d: number, h = 19) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(h, 0, 0, 0);
  return t.toISOString();
};

function summary(id: string, title: string, day: number, extra: Partial<EventSummaryDTO> = {}): EventSummaryDTO {
  return {
    id,
    title,
    category: 'Music',
    startsAt: inDays(day),
    endsAt: inDays(day, 21),
    place: { id: `p${id}`, key: 'illini-union', name: 'Illini Union' },
    locationText: 'Illini Union, ballroom',
    locationDetail: 'Ballroom',
    host: { name: 'Campus Radio', organizationId: null },
    price: { isFree: false, amountCents: 800, note: 'Pay at the door' },
    source: { kind: 'organizer', handle: null },
    goingCount: 120,
    viewer: null,
    ...extra
  };
}

const detail = (viewer: EventDetailDTO['viewer']): EventDetailDTO => ({
  ...summary('e1', 'Battle of the bands', 3, { viewer }),
  description: 'Six bands.',
  status: 'published',
  publishedAt: null
});

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

describe('RSVP panel', () => {
  it('offers RSVP and RSVP anonymously before you RSVP', () => {
    wrap(<RsvpPanel event={detail({ going: false, anonymous: false, inCalendar: false, reminder: 'none' })} />, authValue(true));
    expect(screen.getByRole('button', { name: 'RSVP' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'RSVP anonymously' })).toBeTruthy();
    expect(screen.getByLabelText('Remind me')).toBeTruthy();
  });

  it('shows cancel, the anonymous switch, and the saved reminder once you are going', () => {
    wrap(<RsvpPanel event={detail({ going: true, anonymous: true, inCalendar: true, reminder: '1d' })} />, authValue(true));
    expect(screen.getByText('Going anonymously')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel RSVP' })).toBeTruthy();
    expect((screen.getByLabelText('Keep my RSVP anonymous') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Remind me') as HTMLSelectElement).value).toBe('1d');
    expect(screen.getByRole('button', { name: 'Download calendar file again' })).toBeTruthy();
  });

  it('sends an anonymous RSVP to the API and shows Undo', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => jsonResponse(detail({ going: true, anonymous: true, inCalendar: false, reminder: 'none' })));
    vi.stubGlobal('fetch', fetchMock);
    wrap(<RsvpPanel event={detail({ going: false, anonymous: false, inCalendar: false, reminder: 'none' })} />, authValue(true));
    fireEvent.click(screen.getByRole('button', { name: 'RSVP anonymously' }));
    await waitFor(() => expect(screen.getByText(/You're going to Battle of the bands anonymously/)).toBeTruthy());
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/events/e1/rsvp'));
    expect(call?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ going: true, anonymous: true });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });

  it('asks guests to sign in before RSVPing', () => {
    const requireSignIn = vi.fn();
    wrap(<RsvpPanel event={detail(null)} />, authValue(false, { requireSignIn }));
    fireEvent.click(screen.getByRole('button', { name: 'RSVP' }));
    expect(requireSignIn).toHaveBeenCalledWith('Sign in to RSVP', expect.any(Function));
  });
});

describe('Event page', () => {
  it('lists attendees and says when you are counted anonymously', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/attendees')) return jsonResponse({ total: 120, shown: [{ id: 'a', name: 'Ana Ruiz', initials: 'AR' }] });
        if (url.includes('/api/events/e1')) return jsonResponse(detail({ going: true, anonymous: true, inCalendar: false, reminder: 'none' }));
        return jsonResponse([]);
      })
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/events/e1']}>
          <ToastProvider>
            <AuthContext.Provider value={authValue(true)}>
              <Routes>
                <Route path="/events/:id" element={<EventPage />} />
              </Routes>
            </AuthContext.Provider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('Attendees (120)')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('and 119 more')).toBeTruthy());
    expect(screen.getByText(/You're counted anonymously/)).toBeTruthy();
  });
});

describe('Planner', () => {
  const planner: PlannerDTO = {
    semester: 'Fall 2026',
    upcoming: [
      summary('e1', 'Open mic night', 1, { viewer: { going: true, anonymous: false, inCalendar: true, reminder: '1d' } }),
      summary('e2', 'Late-night pancake study break', 4, { viewer: { going: true, anonymous: true, inCalendar: false, reminder: 'none' }, category: 'Food' })
    ],
    stats: { upcoming: 2, attendedThisSemester: 5, remindersSet: 1, inCalendar: 1 },
    attendedByMonth: [
      { label: 'Sep', value: 2 },
      { label: 'Oct', value: 3 }
    ],
    attendedByCategory: [
      { label: 'Music', value: 3 },
      { label: 'Food', value: 2 }
    ],
    suggestions: [summary('e9', 'Jazz combo recital', 6)]
  };

  it('shows upcoming RSVPs by day with reminders, anonymity, the route, charts, and suggestions', () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([])));
    wrap(<PlannerBody data={planner} />, authValue(true));
    const comingUp = screen.getByRole('heading', { name: 'Coming up' }).parentElement!;
    expect(within(comingUp).getAllByRole('button', { name: 'Cancel RSVP' })).toHaveLength(2);
    expect(within(comingUp).getByText('Reminder 1 day before')).toBeTruthy();
    expect(within(comingUp).getByText('Going anonymously')).toBeTruthy();
    expect(within(comingUp).getByText('Tomorrow')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your route' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Events you attended, by month: Sep 2, Oct 3/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'You might like' })).toBeTruthy();
    expect(screen.getByText('Jazz combo recital')).toBeTruthy();
  });

  it('shows an empty state when nothing is planned', () => {
    wrap(<PlannerBody data={{ ...planner, upcoming: [], stats: { ...planner.stats, upcoming: 0 } }} />, authValue(true));
    expect(screen.getByText('Your planner is empty')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your route' })).toBeNull();
  });
});
