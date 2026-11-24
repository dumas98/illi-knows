import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { MAP_HEIGHT, MAP_WIDTH, project, type EventSummaryDTO, type PlaceDTO, type Point } from '@illi-knows/shared';
import { fmtDay, fmtTime } from '../lib/format';
import { useBasemap } from '../queries';

interface View {
  x: number;
  y: number;
  w: number;
}

interface Marker {
  event: EventSummaryDTO;
  n: number;
  placeKey: string;
  anchor: Point;
  slot: number;
}

interface Cluster {
  members: Marker[];
  sx: number;
  sy: number;
}

interface Props {
  places: PlaceDTO[];
  events: EventSummaryDTO[];
  selectedId?: string | null;
  highlightId?: string | null;
  onSelect?: (id: string | null) => void;
  showPopup?: boolean;
  aspect?: number;
  minWidth?: number;
  route?: boolean;
}

const MIN_W = 50;
const SLOT_PX = 30;
const CLUSTER_PX = 28;
const DEFAULT_CENTER = project([-88.2272, 40.1074]);

const maxWidth = (aspect: number) => Math.max(MAP_WIDTH, MAP_HEIGHT * aspect) * 1.05;

function clampView(v: View, aspect: number): View {
  const w = Math.min(Math.max(v.w, MIN_W), maxWidth(aspect));
  const h = w / aspect;
  const x = w >= MAP_WIDTH ? Math.min(Math.max(v.x, MAP_WIDTH - w), 0) : Math.min(Math.max(v.x, -w * 0.25), MAP_WIDTH - w * 0.75);
  const y = h >= MAP_HEIGHT ? Math.min(Math.max(v.y, MAP_HEIGHT - h), 0) : Math.min(Math.max(v.y, -h * 0.25), MAP_HEIGHT - h * 0.75);
  return { x, y, w };
}

function fitView(points: Point[], aspect: number, minWidth: number): View {
  if (!points.length) {
    const w = 420;
    return clampView({ x: DEFAULT_CENTER[0] - w / 2, y: DEFAULT_CENTER[1] - w / aspect / 2, w }, aspect);
  }
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max((maxX - minX) * 1.3 + 60, ((maxY - minY) * 1.3 + 80) * aspect, minWidth);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2 - 12;
  return clampView({ x: cx - w / 2, y: cy - w / aspect / 2, w }, aspect);
}

const ringPath = (ring: [number, number][]) => 'M' + ring.map(p => project(p).map(n => n.toFixed(1)).join(' ')).join('L') + 'Z';

export function CampusMap({ places, events, selectedId = null, highlightId = null, onSelect, showPopup = true, aspect = 4 / 3, minWidth = 180, route = false }: Props) {
  const basemap = useBasemap();
  const box = useRef<HTMLDivElement>(null);
  const [pxWidth, setPxWidth] = useState(600);
  const usable = useMemo(() => places.filter(p => Array.isArray(p.center) && p.center.length === 2), [places]);
  const placeByKey = useMemo(() => new Map(usable.map(p => [p.key, p])), [usable]);

  const markers = useMemo(() => {
    const slots = new Map<string, number>();
    const counts = new Map<string, number>();
    events.forEach(e => e.place && counts.set(e.place.key, (counts.get(e.place.key) ?? 0) + 1));
    return events.flatMap((event, i): Marker[] => {
      const place = event.place ? placeByKey.get(event.place.key) : undefined;
      if (!place) return [];
      const used = slots.get(place.key) ?? 0;
      slots.set(place.key, used + 1);
      return [{ event, n: i + 1, placeKey: place.key, anchor: project(place.center), slot: used - ((counts.get(place.key) ?? 1) - 1) / 2 }];
    });
  }, [events, placeByKey]);

  const fitKey = `${markers.map(m => m.event.id).join(',')}|${aspect}|${minWidth}`;
  const [fittedFor, setFittedFor] = useState(fitKey);
  const [view, setView] = useState<View>(() => fitView(markers.map(m => m.anchor), aspect, minWidth));
  const [clusterOpen, setClusterOpen] = useState<string[] | null>(null);
  const [hint, setHint] = useState(false);
  if (fittedFor !== fitKey && markers.length > 0) {
    setFittedFor(fitKey);
    setView(fitView(markers.map(m => m.anchor), aspect, minWidth));
    setClusterOpen(null);
  }

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setPxWidth(entry.contentRect.width || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const upp = view.w / pxWidth;
  const viewH = view.w / aspect;

  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) => {
      setView(v => {
        const u = v.w / pxWidth;
        const ax = px ?? pxWidth / 2;
        const ay = py ?? pxWidth / aspect / 2;
        const wx = v.x + ax * u;
        const wy = v.y + ay * u;
        const w = Math.min(Math.max(v.w * factor, MIN_W), maxWidth(aspect));
        const nu = w / pxWidth;
        return clampView({ x: wx - ax * nu, y: wy - ay * nu, w }, aspect);
      });
    },
    [pxWidth, aspect]
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer: number | undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setHint(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(timer);
    };
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; dist?: number }>({ moved: false });

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const all = [...pointers.current.entries()];
    if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)?.[1];
      if (!other) return;
      const dist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (gesture.current.dist) {
        const r = box.current!.getBoundingClientRect();
        zoomAt(gesture.current.dist / dist, (e.clientX + other.x) / 2 - r.left, (e.clientY + other.y) / 2 - r.top);
      }
      gesture.current = { moved: true, dist };
    } else {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        if (!gesture.current.moved && Math.hypot(dx, dy) < 3) return;
        gesture.current.moved = true;
        setView(v => clampView({ x: v.x - dx * (v.w / pxWidth), y: v.y - dy * (v.w / pxWidth), w: v.w }, aspect));
      }
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.dist = undefined;
  };

  const clusters = useMemo(() => {
    const out: Cluster[] = [];
    for (const m of markers) {
      const sx = (m.anchor[0] - view.x) / upp + m.slot * SLOT_PX;
      const sy = (m.anchor[1] - view.y) / upp;
      const near = out.find(c => Math.hypot(c.sx - sx, c.sy - sy) < CLUSTER_PX);
      if (near) near.members.push(m);
      else out.push({ members: [m], sx, sy });
    }
    return out;
  }, [markers, view, upp]);

  const eventPlaces = useMemo(() => new Set(markers.map(m => m.placeKey)), [markers]);

  const select = (id: string) => {
    if (gesture.current.moved) return;
    setClusterOpen(null);
    onSelect?.(selectedId === id ? null : id);
  };

  const openCluster = (c: Cluster) => {
    if (gesture.current.moved) return;
    const pts = c.members.map(m => m.anchor);
    const samePlace = c.members.every(m => m.placeKey === c.members[0]!.placeKey);
    if (samePlace || view.w <= MIN_W * 1.2) {
      onSelect?.(null);
      setClusterOpen(c.members.map(m => m.event.id));
      return;
    }
    setClusterOpen(null);
    setView(fitView(pts, aspect, MIN_W * 1.5));
  };

  const keyActivate = (e: KeyboardEvent, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const selectedCluster = clusters.find(c => c.members.some(m => m.event.id === selectedId));
  const popupCluster = clusterOpen ? clusters.find(c => c.members.some(m => clusterOpen.includes(m.event.id))) : undefined;
  const popupAt = showPopup ? (popupCluster ?? selectedCluster) : undefined;
  const labelAll = upp < 0.38;
  const labelEvents = upp < 1.1;

  return (
    <div className="cmap" ref={box} style={{ aspectRatio: String(aspect) }}>
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${viewH}`}
        role="group"
        aria-label={`Campus map showing ${markers.length} ${markers.length === 1 ? 'event' : 'events'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect className="m-ground" x={-MAP_WIDTH} y={-MAP_HEIGHT} width={MAP_WIDTH * 3} height={MAP_HEIGHT * 3} />
        {basemap.data?.layers && (
          <g aria-hidden="true">
            <path className="m-green" d={basemap.data.layers.green} />
            <path className="m-field" d={basemap.data.layers.fields} />
            <path className="m-water" d={basemap.data.layers.water} />
            <path className="m-waterway" d={basemap.data.layers.waterways} />
            <path className="m-path" d={basemap.data.layers.paths} />
            <path className="m-minor" d={basemap.data.layers.minorRoads} />
            <path className="m-major" d={basemap.data.layers.majorRoads} />
            <path className="m-bld" d={basemap.data.layers.buildings} />
          </g>
        )}
        <g aria-hidden="true">
          {usable.map(p =>
            p.outline && !['quad', 'green', 'field'].includes(p.kind) ? (
              <path key={p.key} className={eventPlaces.has(p.key) ? 'm-place m-venue' : 'm-place'} d={ringPath(p.outline)} />
            ) : null
          )}
        </g>
        <g aria-hidden="true" style={{ fontSize: 11 * upp, strokeWidth: 3 * upp }}>
          {usable.map(p => {
            const show = eventPlaces.has(p.key) ? labelEvents : labelAll;
            if (!show) return null;
            const [x, y] = project(p.center);
            return (
              <text key={p.key} className={eventPlaces.has(p.key) ? 'm-label m-label-venue' : 'm-label'} x={x} y={y + 18 * upp} textAnchor="middle">
                {p.name}
              </text>
            );
          })}
        </g>
        {route && markers.length > 1 && (
          <polyline
            className="m-route"
            points={[...markers].sort((a, b) => a.n - b.n).map(m => `${m.anchor[0]},${m.anchor[1] - 20 * upp}`).join(' ')}
            style={{ strokeWidth: 3 * upp, strokeDasharray: `${7 * upp} ${7 * upp}` }}
          />
        )}
        {clusters.map(c => {
          const x = view.x + c.sx * upp;
          const y = view.y + c.sy * upp;
          if (c.members.length === 1) {
            const m = c.members[0]!;
            const cls = ['pin', m.event.id === selectedId ? 'on' : '', m.event.id === highlightId ? 'hl' : ''].filter(Boolean).join(' ');
            return (
              <g
                key={m.event.id}
                className={cls}
                transform={`translate(${x} ${y}) scale(${upp * 1.15})`}
                tabIndex={onSelect ? 0 : -1}
                role={onSelect ? 'button' : undefined}
                aria-label={`${m.n}. ${m.event.title}, ${fmtDay(m.event.startsAt)}, ${fmtTime(m.event.startsAt)}`}
                onClick={() => select(m.event.id)}
                onKeyDown={e => keyActivate(e, () => select(m.event.id))}
              >
                <path d="M0 0C-3-7-13-13-13-23a13 13 0 1 1 26 0C13-13 3-7 0 0z" />
                <text y={-19} textAnchor="middle">
                  {m.n}
                </text>
              </g>
            );
          }
          const hot = c.members.some(m => m.event.id === highlightId || m.event.id === selectedId);
          return (
            <g
              key={c.members.map(m => m.event.id).join('-')}
              className={`cluster${hot ? ' hl' : ''}`}
              transform={`translate(${x} ${y - 14 * upp}) scale(${upp})`}
              tabIndex={0}
              role="button"
              aria-label={`${c.members.length} events: ${c.members.map(m => m.n).join(', ')}. Select to see them.`}
              onClick={() => openCluster(c)}
              onKeyDown={e => keyActivate(e, () => openCluster(c))}
            >
              <circle r={16} />
              <text y={5} textAnchor="middle">
                {c.members.length}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="map-tools">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(0.6)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 0.6)}>
          −
        </button>
        <button type="button" aria-label="Fit all events" onClick={() => setView(fitView(markers.map(m => m.anchor), aspect, minWidth))}>
          ⤢
        </button>
      </div>
      {hint && <div className="map-hint">Hold ⌘ or Ctrl and scroll to zoom</div>}
      <a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap contributors
      </a>

      {popupAt && (
        <div className={`mpop${popupAt.sy < 150 ? ' below' : ''}`} style={{ left: Math.min(Math.max(popupAt.sx, 130), pxWidth - 130), top: popupAt.sy < 150 ? popupAt.sy + 8 : popupAt.sy - 40 }}>
          <button
            className="mpop-x"
            type="button"
            aria-label="Close preview"
            onClick={() => {
              setClusterOpen(null);
              onSelect?.(null);
            }}
          >
            &times;
          </button>
          {(popupCluster ? popupCluster.members : popupAt.members.filter(m => m.event.id === selectedId)).slice(0, 6).map(m => (
            <div key={m.event.id} className="mpop-item">
              <span className="when">
                {m.n}. {fmtDay(m.event.startsAt)} · {fmtTime(m.event.startsAt)}
              </span>
              <strong>{m.event.title}</strong>
              <span className="small muted">
                {m.event.locationText} · {m.event.goingCount} going
              </span>
              <Link to={`/events/${m.event.id}`} className="small" style={{ fontWeight: 700 }}>
                View event
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
