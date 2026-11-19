import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { MeDTO } from '@illi-knows/shared';

export type AuthStatus = 'loading' | 'guest' | 'unverified' | 'signed-in';

export interface AuthContextValue {
  status: AuthStatus;
  firebaseUser: User | null;
  me: MeDTO | null;
  error: string | null;
  busy: boolean;
  dialog: { open: boolean; title: string };
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  createAccount(name: string, email: string, password: string): Promise<void>;
  resendVerification(): Promise<void>;
  checkVerification(): Promise<void>;
  signOut(): Promise<void>;
  requireSignIn(title: string, after?: () => void): void;
  openSignIn(title?: string): void;
  closeDialog(): void;
  clearError(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
