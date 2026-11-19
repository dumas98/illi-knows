import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Config } from '../config.js';

export interface VerifiedToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export type TokenVerifier = (idToken: string) => Promise<VerifiedToken>;

function firebaseApp(config: Pick<Config, 'FIREBASE_PROJECT_ID' | 'FIREBASE_SERVICE_ACCOUNT_BASE64'>): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const options: Parameters<typeof initializeApp>[0] = { projectId: config.FIREBASE_PROJECT_ID };
  if (config.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const json = JSON.parse(Buffer.from(config.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    options.credential = cert(json);
  }
  return initializeApp(options);
}

export function firebaseVerifier(config: Pick<Config, 'FIREBASE_PROJECT_ID' | 'FIREBASE_SERVICE_ACCOUNT_BASE64'>): TokenVerifier {
  const auth = getAuth(firebaseApp(config));
  return async idToken => {
    const decoded = await auth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      name: typeof decoded.name === 'string' ? decoded.name : null
    };
  };
}
