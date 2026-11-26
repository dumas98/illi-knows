import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { DemoPersonaKey } from '@illi-knows/shared';
import { useAuth } from '../auth/context';
import { SignInDialog } from '../auth/SignInDialog';
import { initials } from '../lib/format';
import { usePlanner, useReviewQueue } from '../queries';
import { useToast } from '../toast-context';

function ViewAs() {
  const { demo } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  if (!demo) return null;
  const change = async (value: string) => {
    const persona = demo.personas.find(p => p.key === value) ?? null;
    await demo.viewAs((persona?.key as DemoPersonaKey | undefined) ?? null);
    navigate(persona?.home ?? '/');
    toast(persona ? `Now viewing as ${persona.label}` : 'Now viewing the landing page as a guest');
  };
  return (
    <label className="viewas">
      <span>View as</span>
      <select value={demo.persona ?? 'landing'} onChange={e => void change(e.target.value)}>
        <option value="landing">Landing page</option>
        {demo.personas.map(p => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Header() {
  const { status, me, openSignIn, signOut, demo } = useAuth();
  const planner = usePlanner();
  const upcoming = planner.data?.stats.upcoming ?? 0;
  const waiting = useReviewQueue('pending').data?.counts.pending ?? 0;
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const search = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/discover?q=${encodeURIComponent(q.trim())}` : '/discover');
  };

  return (
    <header className="top">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="wrap top-row">
        <NavLink className="brand" to="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            Illi-<b>Knows</b>
          </span>
        </NavLink>
        <form className="topsearch" role="search" onSubmit={search}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" />
          </svg>
          <input type="search" aria-label="Search events" placeholder="Search events, clubs, places" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn btn-primary btn-sm" type="submit">
            Search
          </button>
        </form>
        <div className="who">
          <ViewAs />
          {status === 'signed-in' && me ? (
            <>
              {!demo && <span>{me.name}</span>}
              <span className="avatar" aria-hidden="true">
                {initials(me.name)}
              </span>
              <button className="linkbtn" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : status === 'loading' ? null : (
            <>
              <span>Browsing as a guest</span>
              <button className="btn btn-primary btn-sm" type="button" onClick={() => openSignIn()}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
      <div className="wrap">
        <nav aria-label="Main">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/discover">Discover</NavLink>
          {status === 'signed-in' && (
            <NavLink to="/planner">
              My planner
              {upcoming > 0 && (
                <span className="nbadge" aria-label={`${upcoming} upcoming RSVPs`}>
                  {upcoming}
                </span>
              )}
            </NavLink>
          )}
          {status === 'signed-in' && me?.roles.some(r => r === 'organizer' || r === 'admin') && (
            <>
              <NavLink to="/organize">Manage events</NavLink>
              <NavLink to="/insights">Insights</NavLink>
            </>
          )}
          {status === 'signed-in' && me?.roles.includes('admin') && (
            <NavLink to="/review">
              Review
              {waiting > 0 && (
                <span className="nbadge" aria-label={`${waiting} listings waiting for review`}>
                  {waiting}
                </span>
              )}
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

/** On a new page, start at the top and move keyboard and screen-reader focus to the content. */
function useFocusOnNavigate() {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);
  return main;
}

export function Layout() {
  const main = useFocusOnNavigate();
  return (
    <>
      <Header />
      <main className="wrap page" id="main" ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site">
        <div className="wrap">
          Illi-Knows is a student class project. It isn&apos;t affiliated with or endorsed by the University of Illinois. Events shown during development are made up.
        </div>
      </footer>
      <SignInDialog />
    </>
  );
}
