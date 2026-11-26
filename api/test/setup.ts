import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import type { TokenVerifier, VerifiedToken } from '../src/auth/firebase.js';

export const TOKENS: Record<string, VerifiedToken> = {
  student: { uid: 'uid-student', email: 'pat.lee@illinois.edu', emailVerified: true, name: 'Pat Lee' },
  organizer: { uid: 'uid-organizer', email: 'tess.ng@illinois.edu', emailVerified: true, name: 'Tess Ng' },
  admin: { uid: 'uid-admin', email: 'sam.admin@illinois.edu', emailVerified: true, name: 'Sam Admin' },
  outsider: { uid: 'uid-outsider', email: 'someone@gmail.com', emailVerified: true, name: 'Someone' },
  unverified: { uid: 'uid-unverified', email: 'new.person@illinois.edu', emailVerified: false, name: null }
};

export const INGEST_KEY = 'test-ingest-key-0123456789';

export const fakeVerifier: TokenVerifier = async token => {
  const t = TOKENS[token];
  if (!t) throw new Error('bad token');
  return t;
};

export function testApp() {
  return createApp({
    config: { CORS_ORIGINS: ['http://localhost:5173'], ALLOWED_EMAIL_DOMAIN: 'illinois.edu', REQUIRE_VERIFIED_EMAIL: true, DEMO_MODE: false, PUBLIC_WEB_URL: 'https://illi-knows.web.app', INGEST_API_KEY: INGEST_KEY },
    verifyToken: fakeVerifier
  });
}

export async function startDb(): Promise<MongoMemoryServer> {
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri('illi-knows-test'));
  return mem;
}

export async function stopDb(mem: MongoMemoryServer): Promise<void> {
  await mongoose.disconnect();
  await mem.stop();
}

export const auth = (who: keyof typeof TOKENS) => ({ Authorization: `Bearer ${who}` });
