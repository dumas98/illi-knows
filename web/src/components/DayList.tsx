import { Link } from 'react-router-dom';
import type { EventSummaryDTO } from '@illi-knows/shared';
import { catClass, dayKey, fmtDayNum, fmtLongDay, fmtMonth, fmtPrice, fmtTime, relativeDay } from '../lib/format';

function EventCard({ event }: { event: EventSummaryDTO }) {
  const sameDay = dayKey(event.startsAt) === dayKey(event.endsAt);
  return (
    <Link className={`hcard ${catClass(event.category)}`} to={`/events/${event.id}`}>
      <div className="art" aria-hidden="true">
        <span className="catchip">{event.category}</span>
        <span className="badge">
          <b>{fmtMonth(event.startsAt)}</b>
          <i>{fmtDayNum(event.startsAt)}</i>
        </span>
      </div>
      <div className="hbody">
        <span className="when">
          {fmtTime(event.startsAt)}
          {sameDay && ` to ${fmtTime(event.endsAt)}`}
        </span>
        <h3>{event.title}</h3>
        <span className="host">
          {event.host.name} · {event.locationText || 'Location to be announced'}
        </span>
        <span className="foot">
          <span>{event.goingCount} going</span>
          <span aria-hidden="true">·</span>
          <span>{fmtPrice(event.price)}</span>
          <span className="catchip only-sm">{event.category}</span>
          {event.viewer?.going && <span className="going">{event.viewer.anonymous ? 'Going anonymously' : 'Going'}</span>}
        </span>
      </div>
    </Link>
  );
}

/** Events grouped under a heading per campus day. Expects events sorted by start time. */
export function DayList({ events }: { events: EventSummaryDTO[] }) {
  const days = [...new Set(events.map(e => dayKey(e.startsAt)))];
  return (
    <div className="dlist">
      {days.map(d => {
        const list = events.filter(e => dayKey(e.startsAt) === d);
        const first = list[0]!.startsAt;
        const rel = relativeDay(first);
        const long = fmtLongDay(first);
        return (
          <section key={d} className="dgroup" aria-label={long}>
            <h2 className="dhead">
              {rel}
              <span>{rel === long.split(',')[0] ? long.replace(/^\w+, /, '') : long}</span>
            </h2>
            <div className="hlist">
              {list.map(e => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
