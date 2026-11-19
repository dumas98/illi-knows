import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { SignInDialog } from '../auth/SignInDialog';
import { initials } from '../lib/format';

function Header() {
  const { status, me, openSignIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const search = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/discover?q=${encodeURIComponent(q.trim())}` : '/discover');
  };

  return (
    <header className="top">
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
          {status === 'signed-in' && me ? (
            <>
              <span>{me.name}</span>
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
        </nav>
      </div>
    </header>
  );
}

export function Layout() {
  return (
    <>
      <Header />
      <main className="wrap page">
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
