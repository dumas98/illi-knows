import { Link } from 'react-router-dom';
import type { EventSummaryDTO } from '@illi-knows/shared';
import { addDaysKey, catClass, dayKey, fmtDay, fmtTime, keyDayNum, keyDowName } from '../lib/format';
import { FIRST_HOUR, HOUR_PX, LAST_HOUR, MIN_BLOCK_PX, START, layoutDay } from '../lib/weekLayout';

const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

export function WeekGrid({ start, today, events, loading = false }: { start: string; today: string; events: EventSummaryDTO[]; loading?: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const byDay = new Map(days.map(d => [d, [] as EventSummaryDTO[]]));
  for (const e of events) byDay.get(dayKey(e.startsAt))?.push(e);
  const empty = days.every(d => byDay.get(d)!.length === 0);

  return (
    <>
      <div className="wk-scroll">
        <div className="wk">
          <div className="wk-corner" />
          {days.map(d => (
            <div key={d} className={`wk-day${d === today ? ' is-today' : ''}`}>
              <span className="wk-dow">{keyDowName(d)}</span>
              <span className="wk-num">{keyDayNum(d)}</span>
            </div>
          ))}
          <div className="wk-times" aria-hidden="true">
            {hours.map(h => (
              <span key={h} style={{ top: (h - FIRST_HOUR) * HOUR_PX }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map(d => {
            const { placed, lanes } = layoutDay(byDay.get(d)!);
            return (
              <div key={d} className={`wk-col${d === today ? ' is-today' : ''}`}>
                {placed.map(p => {
                  const top = ((p.start - START) / 60) * HOUR_PX + 1;
                  const height = Math.max(((p.end - p.start) / 60) * HOUR_PX - 3, MIN_BLOCK_PX);
                  const going = p.event.viewer?.going;
                  return (
                    <Link
                      key={p.event.id}
                      to={`/events/${p.event.id}`}
                      className={`blk ${catClass(p.event.category)}${going ? ' mine' : ''}`}
                      style={{ top, height, left: `calc(${(p.lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                      aria-label={`${fmtTime(p.event.startsAt)} ${p.event.title}, ${fmtDay(p.event.startsAt)}${going ? ', you’re going' : ''}`}
                      title={`${p.event.title}, ${fmtTime(p.event.startsAt)}`}
                    >
                      <span className="blk-t">{fmtTime(p.event.startsAt)}</span>{' '}
                      <span className="blk-n">{p.event.title}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
        {empty && <p className="wk-empty">{loading ? 'Loading…' : 'Nothing listed this week yet'}</p>}
      </div>
      <div className="gridlegend" aria-hidden="true">
        <span>
          <i />
          Listed event
        </span>
        <span>
          <i className="mine" />
          You&apos;re going
        </span>
        <span>
          <i className="today" />
          Today
        </span>
      </div>
    </>
  );
}
