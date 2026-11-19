import { useId, useState, type FormEvent } from 'react';
import { CAMPUS_EMAIL_DOMAIN } from '@illi-knows/shared';
import { useAuth } from './context';

function GoogleMark() {
  return (
    <svg className="google-g" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function VerifyEmail() {
  const { firebaseUser, resendVerification, checkVerification, signOut, busy, error } = useAuth();
  const [sent, setSent] = useState(false);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p>
        We sent a verification link to <strong>{firebaseUser?.email}</strong>. Click it, then come back here.
      </p>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void checkVerification()}>
        I&apos;ve verified my email
      </button>
      <div className="row small">
        <button className="linkbtn dark" type="button" disabled={busy} onClick={() => void resendVerification().then(() => setSent(true))}>
          {sent ? 'Sent again' : 'Send the email again'}
        </button>
        <span aria-hidden="true">·</span>
        <button className="linkbtn dark" type="button" onClick={() => void signOut()}>
          Use a different account
        </button>
      </div>
    </div>
  );
}

export function SignInForm({ idPrefix }: { idPrefix?: string }) {
  const auth = useAuth();
  const autoId = useId();
  const p = idPrefix ?? autoId;
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (auth.status === 'unverified') return <VerifyEmail />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'create') void auth.createAccount(name, email, password);
    else void auth.signInWithEmail(email, password);
  };

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit} noValidate>
      <button className="btn btn-primary" type="button" disabled={auth.busy} onClick={() => void auth.signInWithGoogle()}>
        <GoogleMark />
        Continue with Illinois Google account
      </button>
      <p className="or">or use your email</p>
      {mode === 'create' && (
        <div className="field">
          <label htmlFor={`${p}-name`}>Your name</label>
          <input id={`${p}-name`} type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${p}-email`}>Campus email</label>
        <input
          id={`${p}-email`}
          type="email"
          autoComplete="email"
          placeholder={`netid@${CAMPUS_EMAIL_DOMAIN}`}
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${p}-password`}>Password</label>
        <input
          id={`${p}-password`}
          type="password"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>
      {auth.error && (
        <p className="err" role="alert">
          {auth.error}
        </p>
      )}
      <button className="btn" type="submit" disabled={auth.busy || !email || !password}>
        {mode === 'create' ? 'Create account' : 'Sign in'}
      </button>
      <p className="small">
        {mode === 'create' ? 'Already have an account? ' : 'New here? '}
        <button
          className="linkbtn dark"
          type="button"
          onClick={() => {
            auth.clearError();
            setMode(mode === 'create' ? 'signin' : 'create');
          }}
        >
          {mode === 'create' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </form>
  );
}
