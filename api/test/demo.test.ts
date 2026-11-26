import type { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigDTO, MeDTO } from '@illi-knows/shared';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { seedDatabase } from '../src/seed/seed.js';
import { fakeVerifier, startDb, stopDb, testApp } from './setup.js';

let mem: MongoMemoryServer;
const demoApp = createApp({
  config: { CORS_ORIGINS: ['http://localhost:5173'], ALLOWED_EMAIL_DOMAIN: 'illinois.edu', REQUIRE_VERIFIED_EMAIL: true, DEMO_MODE: true, PUBLIC_WEB_URL: 'x' },
  verifyToken: fakeVerifier,
  rateLimits: false
});

beforeAll(async () => {
  mem = await startDb();
  await seedDatabase({ fakeUsers: 10 });
});

afterAll(async () => {
  await stopDb(mem);
});

describe('Demo mode', () => {
  it('lists the personas only when it is on', async () => {
    const on = (await request(demoApp).get('/api/config')).body as ConfigDTO;
    expect(on.demoMode).toBe(true);
    expect(on.demoPersonas.map(p => p.key)).toEqual(['student', 'organizer', 'admin']);
    const off = (await request(testApp()).get('/api/config')).body as ConfigDTO;
    expect(off).toMatchObject({ demoMode: false, demoPersonas: [] });
  });

  it('signs in as a seeded persona from the header', async () => {
    const alex = (await request(demoApp).get('/api/me').set('X-Demo-Persona', 'admin')).body as MeDTO;
    expect(alex).toMatchObject({ name: 'Alex Moreno', roles: ['student', 'admin'] });
    expect((await request(demoApp).get('/api/review/queue').set('X-Demo-Persona', 'admin')).status).toBe(200);
    expect((await request(demoApp).get('/api/review/queue').set('X-Demo-Persona', 'student')).status).toBe(403);
    const tim = (await request(demoApp).get('/api/organizer/events').set('X-Demo-Persona', 'organizer')).body as unknown[];
    expect(tim.length).toBeGreaterThan(3);
    expect((await request(demoApp).get('/api/me').set('X-Demo-Persona', 'mallory')).status).toBe(400);
  });

  it('ignores the header when demo mode is off, and refuses to run in production', async () => {
    expect((await request(testApp()).get('/api/me').set('X-Demo-Persona', 'admin')).status).toBe(401);
    expect(() => loadConfig({ MONGODB_URI: 'mongodb://x/y', FIREBASE_PROJECT_ID: 'p', NODE_ENV: 'production', DEMO_MODE: 'true' })).toThrow(/must be off in production/);
  });
});
