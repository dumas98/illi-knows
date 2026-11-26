import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EVENT_STATUS_LABELS, REMINDER_LABELS, REMINDERS, SOURCE_LABELS, type EventDetailDTO, type Reminder } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { CampusMap } from '../components/CampusMap';
import { API_URL, ApiError } from '../lib/api';
import { catClass, fmtLongDay, fmtMonth, fmtDayNum, fmtPrice, fmtTime, initials } from '../lib/format';
import { useAttendees, useEvent, usePlaces, useRsvp } from '../queries';
import { useToast } from '../toast-context';
import { usePageTitle } from '../lib/usePageTitle';

const ICONS = {
  cal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  pin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  tag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </svg>
  )
};

const ANON_HINT = 'Anonymous RSVPs count toward the total, but your name stays off the attendee list. The host only sees a number.';

function Attendees({ event }: { event: EventDetailDTO }) {
  const attendees = useAttendees(event.id);
  const { me } = useAuth();
  const shown = attendees.data?.shown ?? [];
  const more = Math.max(0, event.goingCount - shown.length);
  return (
    <section style={{ gap: 12 }}>
      <h2>Attendees ({event.goingCount})</h2>
      {event.goingCount === 0 ? (
        <p className="muted">Nobody has RSVPed yet. Be the first.</p>
      ) : (
        <div className="row" style={{ gap: 0 }}>
          <span className="faces big">
            {shown.map((a, i) => (
              <span key={a.id} className={`face f${i % 5}`} title={a.name}>
                {a.initials}
              </span>
            ))}
          </span>
          {more > 0 && <span className="more">{shown.length ? `and ${more} more` : `${more} going`}</span>}
        </div>
      )}
      {event.viewer?.going && (
        <p className="small muted">
          {event.viewer.anonymous ? "You're counted anonymously. Other people and the host only see a number." : `You're on this list as ${me?.name ?? 'yourself'}.`}
        </p>
      )}
    </section>
  );
}

export function RsvpPanel({ event }: { event: EventDetailDTO }) {
  const { status, requireSignIn } = useAuth();
  const toast = useToast();
  const { update, cancel } = useRsvp(event.id);
  const signedIn = status === 'signed-in';
  const viewer = event.viewer;
  const going = viewer?.going ?? false;
  const [loadedAt] = useState(() => Date.now());
  const ended = Date.parse(event.endsAt) < loadedAt;
  const busy = update.isPending || cancel.isPending;
  const icsUrl = `${API_URL}/api/events/${event.id}/ics`;

  const fail = (err: unknown) => toast(err instanceof Error ? err.message : 'Something went wrong. Try again.');

  const rsvp = (anonymous: boolean) => {
    const run = () =>
      update.mutate(
        { going: true, anonymous, foundVia: 'other' },
        {
          onSuccess: () =>
            toast(anonymous ? `You're going to ${event.title} anonymously` : `You're going to ${event.title}`, {
              label: 'Undo',
              onClick: () => cancel.mutate(undefined, { onError: fail })
            }),
          onError: fail
        }
      );
    if (signedIn) run();
    else requireSignIn(anonymous ? 'Sign in to RSVP anonymously' : 'Sign in to RSVP', run);
  };

  const cancelRsvp = () => {
    const wasAnonymous = viewer?.anonymous ?? false;
    cancel.mutate(undefined, {
      onSuccess: () =>
        toast('RSVP cancelled', {
          label: 'Undo',
          onClick: () => update.mutate({ going: true, anonymous: wasAnonymous }, { onError: fail })
        }),
      onError: fail
    });
  };

  const addToCalendar = () => {
    const run = () => {
      window.location.href = icsUrl;
      update.mutate({ inCalendar: true }, { onSuccess: () => toast('Calendar file downloaded'), onError: fail });
    };
    if (signedIn) run();
    else requireSignIn('Sign in to save it to your calendar', run);
  };

  if (ended) {
    return (
      <>
        <p className="count-big">{event.goingCount} went</p>
        <p className="hint">This event has ended.</p>
      </>
    );
  }

  return (
    <>
      <p className="count-big">
        {event.goingCount} going
        {going && (
          <>
            {' · '}
            <span className="going">{viewer?.anonymous ? 'Going anonymously' : "You're going"}</span>
          </>
        )}
      </p>
      {going ? (
        <>
          <button className="btn" type="button" disabled={busy} onClick={cancelRsvp}>
            Cancel RSVP
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={viewer?.anonymous ?? false}
              disabled={busy}
              onChange={e => {
                const anonymous = e.target.checked;
                update.mutate(
                  { anonymous },
                  { onSuccess: () => toast(anonymous ? 'Your RSVP is now anonymous' : 'Your name now shows on the attendee list'), onError: fail }
                );
              }}
            />
            Keep my RSVP anonymous
          </label>
        </>
      ) : (
        <>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => rsvp(false)}>
            RSVP
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => rsvp(true)}>
            RSVP anonymously
          </button>
          <p className="hint">{ANON_HINT}</p>
        </>
      )}
      <button className="btn" type="button" disabled={busy} onClick={addToCalendar}>
        {viewer?.inCalendar ? 'Download calendar file again' : 'Add to calendar'}
      </button>
      {signedIn ? (
        <div className="field">
          <label htmlFor="remind">Remind me</label>
          <select
            id="remind"
            value={viewer?.reminder ?? 'none'}
            disabled={busy}
            onChange={e => {
              const reminder = e.target.value as Reminder;
              update.mutate(
                { reminder },
                { onSuccess: () => toast(reminder === 'none' ? 'Reminder removed' : `We'll email you ${REMINDER_LABELS[reminder].toLowerCase()}`), onError: fail }
              );
            }}
          >
            {REMINDERS.map(r => (
              <option key={r} value={r}>
                {REMINDER_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="hint">Anyone can browse. Sign in to RSVP, save it to your calendar, or get a reminder.</p>
      )}
    </>
  );
}

export function EventPage() {
  const { id } = useParams();
  const event = useEvent(id);
  usePageTitle(event.data?.title ?? (event.isError ? 'Event not found' : 'Event'));
  const places = usePlaces();
  const toast = useToast();

  if (event.isPending) return <div className="skeleton">Loading event…</div>;
  if (event.isError || !event.data) {
    const missing = event.error instanceof ApiError && event.error.status === 404;
    return (
      <section className="panel empty stack">
        <h1>{missing ? 'Event not found' : "Couldn't load this event"}</h1>
        <p className="muted">{missing ? 'It may have been removed, or the link is wrong.' : 'Try again in a moment.'}</p>
        <Link className="btn btn-primary" to="/discover">
          Browse events
        </Link>
      </section>
    );
  }

  const e = event.data;
  const copyLink = () => {
    const done = () => toast('Link copied');
    if (navigator.clipboard) navigator.clipboard.writeText(window.location.href).then(done, done);
    else done();
  };

  return (
    <>
      {e.status !== 'published' && (
        <div className="notice" role="note">
          <strong>{EVENT_STATUS_LABELS[e.status]}.</strong> Only you, your organization, and reviewers can see this page until the event is published.{' '}
          <Link to={`/organize/${e.id}/edit`}>Edit event</Link>
        </div>
      )}
      <section style={{ gap: 10 }}>
        <Link to="/discover">Back to events</Link>
        <p className="when">
          {fmtLongDay(e.startsAt)} · {fmtTime(e.startsAt)}
        </p>
        <h1>{e.title}</h1>
        <div className="row" style={{ gap: 12 }}>
          <span className="hostav" aria-hidden="true">
            {initials(e.host.name)}
          </span>
          <span>
            Hosted by <strong>{e.host.name}</strong>
            <br />
            <span className="muted small">
              Found on {SOURCE_LABELS[e.source.kind]}
              {e.source.handle ? `, ${e.source.handle}` : ''}
            </span>
          </span>
        </div>
      </section>
      <div className="ev-layout">
        <div className="stack" style={{ gap: 32 }}>
          <div className={`art wide ${catClass(e.category)}`}>
            <span className="catchip">{e.category}</span>
            <span className="badge" aria-hidden="true">
              <b>{fmtMonth(e.startsAt)}</b>
              <i>{fmtDayNum(e.startsAt)}</i>
            </span>
          </div>
          <section style={{ gap: 10 }}>
            <h2>Details</h2>
            <p>{e.description || 'The host has not added a description yet.'}</p>
          </section>
          <Attendees event={e} />
          <section style={{ gap: 12 }}>
            <h2>Where it is</h2>
            {e.place ? (
              <>
                <CampusMap places={places.data ?? []} events={[e]} showPopup={false} aspect={16 / 9} minWidth={130} />
                <p className="maphint">{e.locationText}</p>
              </>
            ) : (
              <p className="muted">This event isn&apos;t on the map yet. {e.locationText || 'The host has not shared a location.'}</p>
            )}
          </section>
        </div>
        <aside className="panel ev-side">
          <div className="fact">
            {ICONS.cal}
            <span>
              {fmtLongDay(e.startsAt)}
              <span>
                {fmtTime(e.startsAt)} to {fmtTime(e.endsAt)}
              </span>
            </span>
          </div>
          <div className="fact">
            {ICONS.pin}
            <span>
              {e.locationText || 'Location to be announced'}
              <span>{e.category}</span>
            </span>
          </div>
          <div className="fact">
            {ICONS.tag}
            <span>
              {fmtPrice(e.price)}
              <span>{e.price.isFree ? 'No ticket needed' : e.price.note ?? 'Pay at the door'}</span>
            </span>
          </div>
          <hr className="divider" />
          {e.status === 'published' ? <RsvpPanel event={e} /> : <p className="small muted">RSVPs open once the event is published.</p>}
          <button className="btn" type="button" onClick={copyLink}>
            Copy link
          </button>
        </aside>
      </div>
    </>
  );
}
