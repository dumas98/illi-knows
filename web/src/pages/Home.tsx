import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { SignInForm } from '../auth/SignInForm';
import { EventMapList } from '../components/EventMapList';
import { LoadState } from '../components/LoadState';
import { catClass, dayKey, fmtLongDay } from '../lib/format';
import { useEvents, usePlaces } from '../queries';

const WEEK_MS = 7 * 86_400_000;

export function Home() {
  const { status, me, openSignIn, requireSignIn } = useAuth();
  const navigate = useNavigate();
  const places = usePlaces();
  const upcoming = useEvents({ limit: 100 });

  const now = new Date();
  const all = upcoming.data?.items ?? [];
  const week = all.filter(e => Date.parse(e.startsAt) < now.getTime() + WEEK_MS);
  const today = all.filter(e => dayKey(e.startsAt) === dayKey(now)).length;
  const signedIn = status === 'signed-in' && me;
  const firstName = me?.name.split(' ')[0] ?? '';

  return (
    <>
      <section className="lhero bleed">
        <div className="stack" style={{ gap: 22 }}>
          <p className="kicker">{signedIn ? `Hi ${firstName} · ${fmtLongDay(now)}` : `Illi-Knows · ${fmtLongDay(now)}`}</p>
          <h1>
            {signedIn ? (
              <>
                Your week, <span className="fly">sorted</span>
              </>
            ) : (
              <>
                Know what&apos;s on before it&apos;s <span className="fly">over</span>
              </>
            )}
          </h1>
          <p className="lede">
            Club nights, career fairs, free food, and everything in between, from event boards, club Instagram accounts, and word of mouth.
            {signedIn ? '' : ' Browse all of it, no account needed.'}
          </p>
          <div className="row">
            <Link className="btn btn-primary" to="/discover">
              Browse events
            </Link>
            <Link className="btn btn-light" to="/discover?view=map">
              Open the map
            </Link>
          </div>
          <div className="lstats">
            <div>
              <b>{upcoming.data ? week.length : '–'}</b>
              <span>events in the next 7 days</span>
            </div>
            <div>
              <b>{upcoming.data ? today : '–'}</b>
              <span>still happening today</span>
            </div>
            <div>
              <b>3</b>
              <span>sources, each listing checked</span>
            </div>
          </div>
        </div>
        {signedIn ? (
          <div className="sicard">
            <h2>Welcome back</h2>
            <p className="small muted">Signed in as {me.email}. Your planner and RSVPs arrive in the next update.</p>
            <Link className="btn btn-primary" to="/discover">
              Find something for tonight
            </Link>
          </div>
        ) : (
          <div className="sicard" id="signin">
            <h2>Sign in</h2>
            <p className="small muted">RSVP, get reminders, and keep a planner. You don&apos;t need an account to look around.</p>
            {status === 'loading' ? <p className="small muted">Checking your sign-in…</p> : <SignInForm idPrefix="hero" />}
          </div>
        )}
      </section>

      <section>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2>This week around campus</h2>
            <p className="muted">Select a pin to preview an event, or open one from the list.</p>
          </div>
          <Link className="btn" to="/discover?view=map">
            Open the full map
          </Link>
        </div>
        <LoadState query={upcoming} empty={week.length === 0} emptyText="Nothing is listed for the next seven days yet. Check back soon.">
          <EventMapList events={week} places={places.data ?? []} />
        </LoadState>
      </section>

      <section>
        <h2>Browse by category</h2>
        <div className="catgrid">
          {CATEGORIES.map(c => {
            const n = all.filter(e => e.category === c).length;
            return (
              <button key={c} type="button" className={`cattile ${catClass(c)}`} onClick={() => navigate(`/discover?category=${c}`)}>
                <span className="art" aria-hidden="true" />
                <span>
                  <strong>{c}</strong>
                  <br />
                  <span>
                    {n} upcoming {n === 1 ? 'event' : 'events'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {!signedIn && (
        <section className="lband bleed">
          <div className="row between" style={{ alignItems: 'flex-end', gap: 16 }}>
            <div className="stack" style={{ gap: 8 }}>
              <h2>Sign in and it remembers for you</h2>
              <p>Browsing stays open to everyone. An account adds the parts that follow you around campus.</p>
            </div>
            <button className="btn btn-blue" type="button" onClick={() => openSignIn()}>
              Sign in
            </button>
          </div>
          <div className="perks">
            <div>
              <span className="pnum">1</span>
              <h3>RSVP in one tap</h3>
              <p className="small">Hosts know you&apos;re coming, and the event lands in your planner. You can also RSVP anonymously.</p>
            </div>
            <div>
              <span className="pnum">2</span>
              <h3>Reminders that show up</h3>
              <p className="small">An email an hour, a day, or a week before it starts.</p>
            </div>
            <div>
              <span className="pnum">3</span>
              <h3>Post your own events</h3>
              <p className="small">
                Organizers sign in here too, then track RSVPs and check-ins.{' '}
                <button className="linkbtn dark" type="button" onClick={() => requireSignIn('Sign in to post an event')}>
                  Post an event
                </button>
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
