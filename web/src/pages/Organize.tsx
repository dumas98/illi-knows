import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventSummaryDTO, OrganizerEventDTO } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { EventMapList } from '../components/EventMapList';
import { LoadState } from '../components/LoadState';
import { fmtDay, fmtTime } from '../lib/format';
import { statusClass, statusLabel } from '../lib/status';
import { useDeleteEvent, useOrganizerEvents, usePlaces } from '../queries';
import { useToast } from '../toast-context';

export function StatusPill({ event }: { event: Pick<OrganizerEventDTO, 'status' | 'ended'> }) {
  return <span className={`pill ${statusClass(event)}`}>{statusLabel(event)}</span>;
}

export function SignInToOrganize({ title }: { title: string }) {
  const { openSignIn } = useAuth();
  return (
    <section className="panel empty stack">
      <h1>{title}</h1>
      <p className="muted">Sign in with your Illinois account to post events, track RSVPs, and see who showed up.</p>
      <button className="btn btn-primary" type="button" onClick={() => openSignIn('Sign in to post an event')}>
        Sign in
      </button>
    </section>
  );
}

function Actions({ event }: { event: OrganizerEventDTO }) {
  const toast = useToast();
  const remove = useDeleteEvent();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    const people = event.stats.going;
    return (
      <span className="row actions" role="group" aria-label={`Delete ${event.title}?`}>
        <span className="small">
          Delete this event?{people > 0 && ` ${people} ${people === 1 ? 'person loses' : 'people lose'} their RSVP.`} This can&apos;t be undone.
        </span>
        <button
          className="btn btn-sm btn-danger"
          type="button"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(event.id, {
              onSuccess: () => toast(`${event.title} deleted`),
              onError: err => toast(err instanceof Error ? err.message : 'Could not delete the event.')
            })
          }
        >
          Delete
        </button>
        <button className="btn btn-sm" type="button" onClick={() => setConfirming(false)}>
          Keep
        </button>
      </span>
    );
  }
  return (
    <span className="row actions">
      {event.editable && (
        <Link className="btn btn-sm" to={`/organize/${event.id}/edit`} aria-label={`Edit ${event.title}`}>
          Edit
        </Link>
      )}
      {event.status === 'published' && (
        <Link className="btn btn-sm" to={`/insights/${event.id}`} aria-label={`Insights for ${event.title}`}>
          Insights
        </Link>
      )}
      <button className="btn btn-sm btn-danger" type="button" onClick={() => setConfirming(true)} aria-label={`Delete ${event.title}`}>
        Delete
      </button>
    </span>
  );
}

function EventsTable({ events }: { events: OrganizerEventDTO[] }) {
  return (
    <div className="tablewrap">
      <table className="otable">
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Status</th>
            <th className="num">RSVPs</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map(e => (
            <tr key={e.id}>
              <td>
                <Link className="otitle" to={`/events/${e.id}`}>
                  {e.title}
                </Link>
                {e.reviewNote && <div className="small note-bad">Reviewer note: {e.reviewNote}</div>}
                <div className="small muted">{e.locationText || 'No location yet'}</div>
              </td>
              <td className="nowrap">
                {fmtDay(e.startsAt)}
                <div className="small muted">{fmtTime(e.startsAt)}</div>
              </td>
              <td>
                <StatusPill event={e} />
              </td>
              <td className="num">{e.status === 'published' ? e.stats.going : '–'}</td>
              <td>
                <Actions event={e} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Organize() {
  const { status, me } = useAuth();
  const events = useOrganizerEvents();
  const places = usePlaces();

  if (status === 'loading') return <div className="skeleton">Loading…</div>;
  if (status !== 'signed-in') return <SignInToOrganize title="Manage events" />;

  const all = events.data ?? [];
  const count = (pred: (e: OrganizerEventDTO) => boolean) => (events.data ? all.filter(pred).length : '–');
  const upcoming = all
    .filter(e => !e.ended && e.status !== 'rejected' && e.status !== 'cancelled')
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const onMap = upcoming.filter(e => e.place);
  const offMap = upcoming.filter(e => !e.place);
  const byId = new Map(all.map(e => [e.id, e]));
  const orgNames = me?.organizations.map(o => o.name).join(', ');

  return (
    <>
      <section className="phero bleed">
        <p className="kicker">
          {me?.name.split(' ')[0]}
          {orgNames ? ` · ${orgNames}` : ''}
        </p>
        <div className="row between ohead">
          <div className="stack" style={{ gap: 10 }}>
            <h1>
              Post once. Fill the <span className="fly">room</span>
            </h1>
            <p className="lede on-dark">Create events, see what&apos;s waiting on review, and track who actually shows up.</p>
          </div>
          <Link className="btn btn-primary" to="/organize/new">
            Create event
          </Link>
        </div>
        <div className="tiles">
          <div className="tile">
            <span className="lab">Published</span>
            <span className="num">{count(e => e.status === 'published' && !e.ended)}</span>
            <span className="sub">Live for everyone</span>
          </div>
          <div className="tile">
            <span className="lab">In review</span>
            <span className="num">{count(e => e.status === 'in_review')}</span>
            <span className="sub">Usually under a day</span>
          </div>
          <div className="tile">
            <span className="lab">Needs changes</span>
            <span className="num">{count(e => e.status === 'changes_requested')}</span>
            <span className="sub">Fix and resend</span>
          </div>
          <div className="tile">
            <span className="lab">Drafts</span>
            <span className="num">{count(e => e.status === 'draft')}</span>
            <span className="sub">Only you can see these</span>
          </div>
        </div>
      </section>

      <LoadState query={events} empty={false} emptyText="">
        {all.length === 0 ? (
          <section className="panel empty stack">
            <h2>Post your first event</h2>
            <p className="muted">Fill in the basics and send it for review. Once it&apos;s approved, it shows up on Discover and the map.</p>
            <Link className="btn btn-primary" to="/organize/new">
              Create event
            </Link>
          </section>
        ) : (
          <>
            {upcoming.length > 0 && (
              <section>
                <div className="stack" style={{ gap: 4 }}>
                  <h2>Where your events are</h2>
                  <p className="muted">Upcoming events, drafts included. Select one to find it on the map.</p>
                </div>
                {onMap.length > 0 && (
                  <EventMapList
                    events={onMap}
                    places={places.data ?? []}
                    hint="Numbers match the list."
                    foot={(e: EventSummaryDTO) => {
                      const o = byId.get(e.id)!;
                      return (
                        <>
                          <StatusPill event={o} />
                          {o.status === 'published' && <span>{o.stats.going} RSVPs</span>}
                        </>
                      );
                    }}
                  />
                )}
                {offMap.map(e => (
                  <p key={e.id} className="row small offmap">
                    <span className="flag">Not on the map</span>
                    <span>{e.title} has no campus location yet.</span>
                    {e.editable && (
                      <Link className="small" to={`/organize/${e.id}/edit`}>
                        Add one
                      </Link>
                    )}
                  </p>
                ))}
              </section>
            )}
            <section className="panel">
              <h2>Your events</h2>
              <EventsTable events={all} />
            </section>
          </>
        )}
      </LoadState>
    </>
  );
}
