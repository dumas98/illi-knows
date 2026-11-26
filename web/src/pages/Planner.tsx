import { Link } from 'react-router-dom';
import { REMINDER_LABELS, type EventSummaryDTO, type PlannerDTO } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { Bars } from '../components/Bars';
import { CampusMap } from '../components/CampusMap';
import { LoadState } from '../components/LoadState';
import { catClass, dayKey, fmtDay, fmtDayNum, fmtLongDay, fmtMonth, fmtPrice, fmtTime, relativeDay } from '../lib/format';
import { usePlaces, usePlanner, useRsvp } from '../queries';
import { useToast } from '../toast-context';

function relative(iso: string): string {
  const days = Math.round((Date.parse(dayKey(iso)) - Date.parse(dayKey(new Date()))) / 86_400_000);
  if (days <= 1) return relativeDay(iso);
  if (days < 14) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
}

function Entry({ event }: { event: EventSummaryDTO }) {
  const toast = useToast();
  const { update, cancel } = useRsvp(event.id);
  const v = event.viewer;
  const fail = (err: unknown) => toast(err instanceof Error ? err.message : 'Something went wrong. Try again.');
  const onCancel = () => {
    const anonymous = v?.anonymous ?? false;
    cancel.mutate(undefined, {
      onSuccess: () => toast(`RSVP to ${event.title} cancelled`, { label: 'Undo', onClick: () => update.mutate({ going: true, anonymous }, { onError: fail }) }),
      onError: fail
    });
  };
  return (
    <div className={`entry ${catClass(event.category)}`}>
      <span className="etime">{fmtTime(event.startsAt)}</span>
      <div className="ebody">
        <Link className="etitle" to={`/events/${event.id}`}>
          {event.title}
        </Link>
        <span className="emeta">
          {event.locationText || 'Location to be announced'} · {event.goingCount} going · {fmtPrice(event.price)}
        </span>
        <span className="enote">
          <span>{event.category}</span>
          <span aria-hidden="true">·</span>
          <span>{v && v.reminder !== 'none' ? `Reminder ${REMINDER_LABELS[v.reminder].toLowerCase()}` : 'No reminder'}</span>
          {v?.anonymous && (
            <>
              <span aria-hidden="true">·</span>
              <span>Going anonymously</span>
            </>
          )}
          {v?.inCalendar && (
            <>
              <span aria-hidden="true">·</span>
              <span>In your calendar</span>
            </>
          )}
        </span>
      </div>
      <div className="eside">
        <button className="btn btn-sm" type="button" disabled={cancel.isPending} onClick={onCancel}>
          Cancel RSVP
        </button>
      </div>
    </div>
  );
}

function ComingUp({ events }: { events: EventSummaryDTO[] }) {
  const days = [...new Set(events.map(e => dayKey(e.startsAt)))];
  return (
    <div className="plist">
      {days.map(d => {
        const list = events.filter(e => dayKey(e.startsAt) === d);
        const first = list[0]!.startsAt;
        return (
          <div key={d} className={`pday${dayKey(new Date()) === d ? ' is-today' : ''}`}>
            <div className="pdate">
              <span className="pcal" aria-hidden="true">
                <b>{fmtMonth(first)}</b>
                <i>{fmtDayNum(first)}</i>
              </span>
              <span>
                <span className="pdow">{fmtLongDay(first).replace(/, \w+ \d+$/, '')}, {fmtMonth(first)} {fmtDayNum(first)}</span>
                <span className="prel">{relative(first)}</span>
              </span>
            </div>
            <div className="prows">
              {list.map(e => (
                <Entry key={e.id} event={e} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Suggestion({ event }: { event: EventSummaryDTO }) {
  return (
    <Link className={`card ${catClass(event.category)}`} to={`/events/${event.id}`}>
      <div className="art">
        <span className="catchip">{event.category}</span>
        <span className="badge" aria-hidden="true">
          <b>{fmtMonth(event.startsAt)}</b>
          <i>{fmtDayNum(event.startsAt)}</i>
        </span>
      </div>
      <div className="cbody">
        <span className="when">
          {fmtDay(event.startsAt)} · {fmtTime(event.startsAt)}
        </span>
        <h3>{event.title}</h3>
        <span className="host">
          {event.host.name} · {event.locationText}
        </span>
        <span className="foot">
          {event.goingCount} going · {fmtPrice(event.price)}
        </span>
      </div>
    </Link>
  );
}

export function PlannerBody({ data }: { data: PlannerDTO }) {
  const places = usePlaces();
  const { stats, upcoming } = data;
  return (
    <>
      <section>
        <h2>Coming up</h2>
        {upcoming.length ? (
          <ComingUp events={upcoming} />
        ) : (
          <div className="panel empty stack">
            <h3>Your planner is empty</h3>
            <p className="muted">Events you RSVP to show up here, day by day, with their reminders.</p>
            <Link className="btn btn-primary" to="/discover">
              Find events
            </Link>
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <div className="stack" style={{ gap: 4 }}>
            <h2>Your route</h2>
            <p className="muted">The dashed line connects your RSVPs in date order.</p>
          </div>
          <div className="msplit">
            <ol className="mkey">
              {upcoming.map((e, i) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`}>
                    <span className="mnum" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>
                      <strong>{e.title}</strong>
                      <br />
                      <span className="small muted">
                        {fmtDay(e.startsAt)} · {fmtTime(e.startsAt)} · {e.locationText || 'Not on the map'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <div className="mmap">
              <CampusMap places={places.data ?? []} events={upcoming} route />
            </div>
          </div>
        </section>
      )}

      <section className="grid-2">
        <Bars title="Events you attended, by month" data={data.attendedByMonth} orientation="columns" />
        <Bars title="What you go to" data={data.attendedByCategory} orientation="rows" />
      </section>

      {data.suggestions.length > 0 && (
        <section>
          <h2>You might like</h2>
          <div className="cards">
            {data.suggestions.map(e => (
              <Suggestion key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}
      <p className="hint">
        {stats.remindersSet > 0
          ? 'Reminder emails start once email sending is set up. Your choices are saved.'
          : 'Set a reminder on any event page and it will show here.'}
      </p>
    </>
  );
}

export function Planner() {
  const { status, me, openSignIn } = useAuth();
  const planner = usePlanner();

  if (status === 'loading') return <div className="skeleton">Loading…</div>;
  if (status !== 'signed-in') {
    return (
      <section className="panel empty stack">
        <h1>Your planner</h1>
        <p className="muted">Sign in to see the events you RSVPed to, your reminders, and your route around campus.</p>
        <button className="btn btn-primary" type="button" onClick={() => openSignIn('Sign in to see your planner')}>
          Sign in
        </button>
      </section>
    );
  }

  const stats = planner.data?.stats;
  const next = planner.data?.upcoming[0];
  return (
    <>
      <section className="phero bleed">
        <p className="kicker">
          {me?.name.split(' ')[0]} · {planner.data?.semester ?? 'This semester'}
        </p>
        <h1>Your planner</h1>
        <div className="tiles">
          <div className="tile">
            <span className="lab">Upcoming RSVPs</span>
            <span className="num">{stats?.upcoming ?? '–'}</span>
            <span className="sub">{next ? `Next: ${fmtDay(next.startsAt)}` : 'None yet'}</span>
          </div>
          <div className="tile">
            <span className="lab">Attended this semester</span>
            <span className="num">{stats?.attendedThisSemester ?? '–'}</span>
            <span className="sub">Checked in at the door</span>
          </div>
          <div className="tile">
            <span className="lab">Reminders set</span>
            <span className="num">{stats?.remindersSet ?? '–'}</span>
            <span className="sub">Sent by email</span>
          </div>
          <div className="tile">
            <span className="lab">In your calendar</span>
            <span className="num">{stats?.inCalendar ?? '–'}</span>
            <span className="sub">Downloaded calendar files</span>
          </div>
        </div>
      </section>
      <LoadState query={planner} empty={false} emptyText="">
        {planner.data && <PlannerBody data={planner.data} />}
      </LoadState>
    </>
  );
}
