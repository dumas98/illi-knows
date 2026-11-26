import { Link, useNavigate, useParams } from 'react-router-dom';
import type { InsightsDTO } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { Bars } from '../components/Bars';
import { LoadState } from '../components/LoadState';
import { fmtDay } from '../lib/format';
import { useInsights, useOrganizerEvents } from '../queries';
import { SignInToOrganize } from './Organize';

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

function PastChart({ past }: { past: InsightsDTO['past'] }) {
  const max = Math.max(1, ...past.flatMap(p => [p.going, p.checkedIn]));
  const label = `RSVPs and check-ins across your past events: ${past.map(p => `${p.title}, ${p.going} RSVPs, ${p.checkedIn} checked in`).join('; ')}`;
  return (
    <section className="panel">
      <h3>RSVPs and check-ins across your past events</h3>
      {past.length === 0 ? (
        <p className="muted small">Numbers show up here after your first event ends.</p>
      ) : (
        <>
          <div className="legend" aria-hidden="true">
            <span>
              <i className="k-rsvp" />
              RSVPs
            </span>
            <span>
              <i className="k-in" />
              Checked in
            </span>
          </div>
          <div className="gchart" role="img" aria-label={label}>
            {past.map(p => (
              <div key={p.id} className="gcol">
                <div className="gbars">
                  <span className="gbar k-rsvp" style={{ height: `${(p.going / max) * 100}%` }}>
                    <b>{p.going}</b>
                  </span>
                  <span className="gbar k-in" style={{ height: `${(p.checkedIn / max) * 100}%` }}>
                    <b>{p.checkedIn}</b>
                  </span>
                </div>
                <span className="lab" title={p.title}>
                  {p.title}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <details>
        <summary>View as table</summary>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th className="num">RSVPs</th>
              <th className="num">Checked in</th>
            </tr>
          </thead>
          <tbody>
            {past.map(p => (
              <tr key={p.id}>
                <td>
                  {p.title} · {fmtDay(p.startsAt)}
                </td>
                <td className="num">{p.going}</td>
                <td className="num">{p.checkedIn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function InsightsBody({ data }: { data: InsightsDTO }) {
  const e = data.event;
  return (
    <>
      <section className="grid-2">
        <Bars
          title="RSVPs in the two weeks before the event"
          orientation="columns"
          data={data.rsvpsByDay.map(d => ({ label: d.daysBefore === 0 ? 'Day' : String(d.daysBefore), value: d.count }))}
          emptyText="No RSVPs in the two weeks before the event yet."
          caption={`Days before the event. ${data.earlier > 0 ? `${data.earlier} more RSVPed earlier than that.` : ''}`}
          tableHead={['Days before', 'New RSVPs']}
        />
        <Bars
          title="How people found this event"
          orientation="rows"
          data={data.foundVia}
          emptyText="Nobody has RSVPed yet."
          caption={e.stats.going > 0 ? 'Asked when people RSVP. Anonymous RSVPs are counted but never named.' : undefined}
          tableHead={['Source', 'RSVPs']}
        />
      </section>
      <PastChart past={data.past} />
    </>
  );
}

export function Insights() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { status, me } = useAuth();
  const events = useOrganizerEvents();
  const published = (events.data ?? []).filter(e => e.status === 'published').sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const fallback = published.find(e => !e.ended && e.stats.going > 0) ?? published[0];
  const selectedId = id ?? fallback?.id;
  const insights = useInsights(selectedId);

  if (status === 'loading') return <div className="skeleton">Loading…</div>;
  if (status !== 'signed-in') return <SignInToOrganize title="Insights" />;

  if (events.data && published.length === 0) {
    return (
      <section className="panel empty stack">
        <h1>Insights</h1>
        <h3>Publish your first event</h3>
        <p className="muted">RSVP and attendance numbers show up here once an event is live.</p>
        <Link className="btn btn-primary" to="/organize">
          Manage events
        </Link>
      </section>
    );
  }

  const e = insights.data?.event;
  return (
    <>
      <section className="phero bleed">
        <p className="kicker">
          {me?.name.split(' ')[0]} · {e?.host.name ?? 'Your events'}
        </p>
        <div className="row between ohead">
          <h1>Insights</h1>
          <div className="field on-dark">
            <label htmlFor="ins-event">Event</label>
            <select id="ins-event" value={selectedId ?? ''} onChange={ev => navigate(`/insights/${ev.target.value}`)}>
              {published.map(x => (
                <option key={x.id} value={x.id}>
                  {x.title} · {fmtDay(x.startsAt)}
                </option>
              ))}
              {id && !published.some(x => x.id === id) && e && <option value={id}>{e.title}</option>}
            </select>
          </div>
        </div>
        <div className="tiles">
          <div className="tile">
            <span className="lab">Page views</span>
            <span className="num">{e ? e.stats.views.toLocaleString() : '–'}</span>
            <span className="sub">Since it was published</span>
          </div>
          <div className="tile">
            <span className="lab">RSVPs</span>
            <span className="num">{e ? e.stats.going : '–'}</span>
            <span className="sub">{e ? `${pct(e.stats.going, e.stats.views)} of viewers · ${e.stats.anonymous} anonymous` : ' '}</span>
          </div>
          <div className="tile">
            <span className="lab">Checked in</span>
            <span className="num">{e?.ended ? e.stats.checkedIn : '–'}</span>
            <span className="sub">{e?.ended ? 'Counted at the door' : 'Counted after the event'}</span>
          </div>
          <div className="tile">
            <span className="lab">Show-up rate</span>
            <span className="num">{e?.ended ? pct(e.stats.checkedIn, e.stats.going) : '–'}</span>
            <span className="sub">{e?.ended ? 'Of people who RSVPed' : 'Available after the event'}</span>
          </div>
        </div>
      </section>
      <LoadState query={insights} empty={false} emptyText="">
        {insights.data && <InsightsBody data={insights.data} />}
      </LoadState>
    </>
  );
}
