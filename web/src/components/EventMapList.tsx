import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EventSummaryDTO, PlaceDTO } from '@illi-knows/shared';
import { catClass, fmtDay, fmtPrice, fmtTime } from '../lib/format';
import { CampusMap } from './CampusMap';

function EventRow({ event, n, on, onHover, foot }: { event: EventSummaryDTO; n: number; on: boolean; onHover: (id: string | null) => void; foot?: (e: EventSummaryDTO) => ReactNode }) {
  return (
    <Link
      to={`/events/${event.id}`}
      className={`mrow${on ? ' on' : ''}`}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(event.id)}
      onBlur={() => onHover(null)}
    >
      <span className="mnum" aria-hidden="true">
        {n}
      </span>
      <div className={`art sm ${catClass(event.category)}`} aria-hidden="true" />
      <div className="hbody">
        <span className="when">
          {fmtDay(event.startsAt)} · {fmtTime(event.startsAt)}
        </span>
        <h3>{event.title}</h3>
        <span className="host">{event.locationText || 'Location to be announced'}</span>
        <span className="foot">
          {foot ? (
            foot(event)
          ) : (
            <>
              <span>
                {event.goingCount} going · {fmtPrice(event.price)}
              </span>
              <span className="catchip">{event.category}</span>
              {event.viewer?.going && <span className="going">{event.viewer.anonymous ? 'Going anonymously' : 'Going'}</span>}
            </>
          )}
        </span>
      </div>
    </Link>
  );
}

export function EventMapList({
  events,
  places,
  hint,
  foot
}: {
  events: EventSummaryDTO[];
  places: PlaceDTO[];
  hint?: string;
  /** Replaces the row's footer (going count, price, category). */
  foot?: (e: EventSummaryDTO) => ReactNode;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const offMap = events.filter(e => !e.place).length;

  return (
    <div className="msplit">
      <div className="mrows">
        {events.map((e, i) => (
          <EventRow key={e.id} event={e} n={i + 1} on={selected === e.id} onHover={setHover} foot={foot} />
        ))}
      </div>
      <div className="mmap">
        <CampusMap places={places} events={events} selectedId={selected} highlightId={hover} onSelect={setSelected} />
        <p className="maphint">
          {hint ?? 'Numbers match the list. Select a pin to preview an event.'}
          {offMap > 0 && ` ${offMap} ${offMap === 1 ? 'event isn’t' : 'events aren’t'} on the map yet.`}
        </p>
      </div>
    </div>
  );
}
