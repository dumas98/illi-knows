import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from 'firebase/auth';
import { CAMPUS_EMAIL_DOMAIN, type MeDTO } from '@illi-knows/shared';
import { ApiError, api, canUseAccount } from '../lib/api';
import { auth } from '../lib/firebase';
import { AuthContext, type AuthContextValue, type AuthStatus } from './context';

const WRONG_DOMAIN = `Use your @${CAMPUS_EMAIL_DOMAIN} account to sign in.`;

function friendlyError(err: unknown): string | null {
  if (err instanceof ApiError) return err.message;
  if (!(err instanceof FirebaseError)) return 'Something went wrong. Try again.';
  switch (err.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match.";
    case 'auth/email-already-in-use':
      return 'An account with that email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Use a password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return "Can't reach the sign-in service. Check your connection.";
    default:
      return 'Sign-in failed. Try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState({ open: false, title: 'Sign in to Illi-Knows' });
  const after = useRef<(() => void) | null>(null);

  const signOut = useCallback(async () => {
    after.current = null;
    await firebaseSignOut(auth);
    queryClient.removeQueries({ queryKey: ['me'] });
    await queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(
    () =>
      onIdTokenChanged(auth, user => {
        if (user && !canUseAccount(user.email)) {
          setError(WRONG_DOMAIN);
          void firebaseSignOut(auth);
        }
        setFirebaseUser(user);
        setVersion(v => v + 1);
        setReady(true);
      }),
    []
  );

  const usable = !!firebaseUser && firebaseUser.emailVerified && canUseAccount(firebaseUser.email);
  const meQuery = useQuery({
    queryKey: ['me', firebaseUser?.uid],
    queryFn: async () => {
      const firstLoad = !queryClient.getQueryData(['me', firebaseUser?.uid]);
      let me: MeDTO;
      try {
        me = await api<MeDTO>('/api/me');
      } catch (err) {
        setError(friendlyError(err));
        await signOut();
        throw err;
      }
      if (firstLoad) {
        setDialog(d => (d.open ? { ...d, open: false } : d));
        const run = after.current;
        after.current = null;
        void queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== 'me' });
        if (run) queueMicrotask(run);
      }
      return me;
    },
    enabled: usable,
    retry: false,
    staleTime: 5 * 60_000
  });

  let status: AuthStatus = 'loading';
  if (!ready) status = 'loading';
  else if (!firebaseUser || !canUseAccount(firebaseUser.email)) status = 'guest';
  else if (!firebaseUser.emailVerified) status = 'unverified';
  else if (meQuery.data) status = 'signed-in';
  else if (meQuery.isError) status = 'guest';

  const attempt = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUser,
      me: meQuery.data ?? null,
      error,
      busy,
      dialog,
      signInWithGoogle: () =>
        attempt(async () => {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ hd: CAMPUS_EMAIL_DOMAIN, prompt: 'select_account' });
          await signInWithPopup(auth, provider);
        }),
      signInWithEmail: (email, password) =>
        attempt(async () => {
          if (!canUseAccount(email)) throw new ApiError(400, 'email_domain', WRONG_DOMAIN);
          await signInWithEmailAndPassword(auth, email.trim(), password);
        }),
      createAccount: (name, email, password) =>
        attempt(async () => {
          if (!canUseAccount(email)) throw new ApiError(400, 'email_domain', WRONG_DOMAIN);
          const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
          if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
          await sendEmailVerification(cred.user);
        }),
      resendVerification: () =>
        attempt(async () => {
          if (auth.currentUser) await sendEmailVerification(auth.currentUser);
        }),
      checkVerification: () =>
        attempt(async () => {
          if (!auth.currentUser) return;
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
          setFirebaseUser(auth.currentUser);
          setVersion(v => v + 1);
          if (!auth.currentUser.emailVerified) throw new ApiError(400, 'email_unverified', "We can't see the verification yet. Click the link in the email, then try again.");
        }),
      signOut,
      requireSignIn: (title, then) => {
        if (status === 'signed-in') {
          then?.();
          return;
        }
        after.current = then ?? null;
        setError(null);
        setDialog({ open: true, title });
      },
      openSignIn: title => {
        after.current = null;
        setError(null);
        setDialog({ open: true, title: title ?? 'Sign in to Illi-Knows' });
      },
      closeDialog: () => {
        after.current = null;
        setDialog(d => ({ ...d, open: false }));
      },
      clearError: () => setError(null)
    }),
    [status, firebaseUser, meQuery.data, error, busy, dialog, attempt, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
