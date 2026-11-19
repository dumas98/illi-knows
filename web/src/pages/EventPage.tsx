import { Link, useParams } from 'react-router-dom';
import { SOURCE_LABELS } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { CampusMap } from '../components/CampusMap';
import { ApiError } from '../lib/api';
import { catClass, fmtLongDay, fmtMonth, fmtDayNum, fmtPrice, fmtTime, initials } from '../lib/format';
import { useEvent, usePlaces } from '../queries';
import { useToast } from '../toast-context';

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

export function EventPage() {
  const { id } = useParams();
  const event = useEvent(id);
  const places = usePlaces();
  const { requireSignIn } = useAuth();
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
  const going = e.viewer?.going ?? false;
  const notYet = () => toast('RSVPs go live in the next update.');

  return (
    <>
      <section style={{ gap: 10 }}>
        <Link to="/discover">Back to events</Link>
        <p className="when">
          {fmtLongDay(e.startsAt)} · {fmtTime(e.startsAt)}
        </p>
        <h1>{e.title}</h1>
        <div className="row" style={{ gap: 12 }}>
          <span className="avatar" style={{ background: 'var(--blue)', color: '#fff', borderRadius: 12, width: 44, height: 44 }} aria-hidden="true">
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
          <section style={{ gap: 12 }}>
            <h2>Where it is</h2>
            {e.place ? (
              <>
                <CampusMap places={places.data ?? []} events={[e]} showPopup={false} />
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
          <p className="count-big">
            {e.goingCount} going
            {going && (
              <>
                {' · '}
                <span className="going">{e.viewer?.anonymous ? 'Going anonymously' : "You're going"}</span>
              </>
            )}
          </p>
          <button className="btn btn-primary" type="button" onClick={() => requireSignIn('Sign in to RSVP', notYet)}>
            RSVP
          </button>
          <button className="btn" type="button" onClick={() => requireSignIn('Sign in to RSVP anonymously', notYet)}>
            RSVP anonymously
          </button>
          <p className="hint">Anonymous RSVPs count toward the total, but your name stays off the attendee list. The host only sees a number.</p>
        </aside>
      </div>
    </>
  );
}
