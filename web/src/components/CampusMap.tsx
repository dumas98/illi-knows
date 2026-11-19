import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { MAP_SIZE, type EventSummaryDTO, type PlaceDTO } from '@illi-knows/shared';
import { fmtDay, fmtTime } from '../lib/format';

interface Pin {
  event: EventSummaryDTO;
  n: number;
  x: number;
  y: number;
}

interface Props {
  places: PlaceDTO[];
  events: EventSummaryDTO[];
  selectedId?: string | null;
  highlightId?: string | null;
  onSelect?: (id: string | null) => void;
  showPopup?: boolean;
}

function MapBase({ places }: { places: PlaceDTO[] }) {
  return (
    <>
      <rect className="m-ground" width={MAP_SIZE.width} height={MAP_SIZE.height} />
      <path className="m-street" d="M0 152H800M0 305H800M220 0V520M555 0V520" />
      {places.map(({ key, kind, map: m }) =>
        kind === 'quad' ? (
          <g key={key}>
            <rect className="m-quad" x={m.x} y={m.y} width={m.w} height={m.h} rx={10} />
            <path className="m-walk" d={`M${m.x} ${m.y}L${m.x + m.w} ${m.y + m.h}M${m.x + m.w} ${m.y}L${m.x} ${m.y + m.h}`} />
          </g>
        ) : kind === 'field' ? (
          <g key={key}>
            <rect className="m-field" x={m.x} y={m.y} width={m.w} height={m.h} rx={10} />
            <rect className="m-track" x={m.x + 24} y={m.y + 24} width={m.w - 48} height={m.h - 34} rx={(m.h - 34) / 2} />
          </g>
        ) : (
          <rect key={key} className="m-bld" x={m.x} y={m.y} width={m.w} height={m.h} rx={8} />
        )
      )}
      {places.map(p => (
        <text key={`${p.key}-label`} className={`m-label${p.kind === 'building' ? '' : ' on-dark'}`} x={p.map.x + 10} y={p.map.y + 22}>
          {p.name}
        </text>
      ))}
    </>
  );
}

function placePins(places: PlaceDTO[], events: EventSummaryDTO[]): Pin[] {
  const byPlace = new Map<string, { event: EventSummaryDTO; n: number }[]>();
  events.forEach((event, i) => {
    if (!event.place) return;
    const list = byPlace.get(event.place.key) ?? [];
    list.push({ event, n: i + 1 });
    byPlace.set(event.place.key, list);
  });
  const pins: Pin[] = [];
  for (const place of places) {
    const list = byPlace.get(place.key) ?? [];
    list.forEach((item, j) => {
      pins.push({ ...item, x: place.map.x + place.map.w / 2 + (j - (list.length - 1) / 2) * 42, y: place.map.y + place.map.h - 4 });
    });
  }
  return pins;
}

export function CampusMap({ places, events, selectedId = null, highlightId = null, onSelect, showPopup = true }: Props) {
  const pins = placePins(places, events);
  const ordered = [...pins].sort((a, b) => Number(a.event.id === selectedId) - Number(b.event.id === selectedId));
  const selected = showPopup ? pins.find(p => p.event.id === selectedId) : undefined;

  const toggle = (id: string) => onSelect?.(selectedId === id ? null : id);
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(id);
    }
  };

  return (
    <div className="cmap">
      <svg viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`} role="group" aria-label={`Campus map showing ${pins.length} ${pins.length === 1 ? 'event' : 'events'}`}>
        <MapBase places={places} />
        {ordered.map(p => {
          const cls = ['pin', p.event.id === selectedId ? 'on' : '', p.event.id === highlightId ? 'hl' : ''].filter(Boolean).join(' ');
          return (
            <g
              key={p.event.id}
              className={cls}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? 'button' : undefined}
              aria-label={`${p.n}. ${p.event.title}, ${fmtDay(p.event.startsAt)}, ${fmtTime(p.event.startsAt)}`}
              transform={`translate(${p.x} ${p.y}) scale(1.4)`}
              onClick={() => toggle(p.event.id)}
              onKeyDown={e => onKey(e, p.event.id)}
            >
              <path d="M0 0C-3-7-13-13-13-23a13 13 0 1 1 26 0C13-13 3-7 0 0z" />
              <text y={-19} textAnchor="middle">
                {p.n}
              </text>
            </g>
          );
        })}
      </svg>
      {selected && (
        <div
          className={`mpop${selected.y < 200 ? ' below' : ''}`}
          style={{
            left: `${Math.min(Math.max(selected.x / 8, 18), 82)}%`,
            top: `${(selected.y < 200 ? selected.y : selected.y - 56) / 5.2}%`
          }}
        >
          <button className="mpop-x" type="button" aria-label="Close preview" onClick={() => onSelect?.(null)}>
            &times;
          </button>
          <span className="when">
            {fmtDay(selected.event.startsAt)} · {fmtTime(selected.event.startsAt)}
          </span>
          <strong>{selected.event.title}</strong>
          <span className="small muted">
            {selected.event.locationText} · {selected.event.goingCount} going
          </span>
          <Link to={`/events/${selected.event.id}`} className="small" style={{ fontWeight: 700 }}>
            View event
          </Link>
        </div>
      )}
    </div>
  );
}
