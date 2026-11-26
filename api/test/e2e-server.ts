/**
 * The API the end-to-end tests talk to: an in-memory database with a freshly seeded semester,
 * demo personas on, rate limits off, and emails only logged. Run with `npm run e2e:api -w @illi-knows/api`.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/db.js';
import { seedDatabase } from '../src/seed/seed.js';

const port = Number(process.env.E2E_API_PORT ?? 4100);
const webOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:5174';

const mem = await MongoMemoryServer.create();
await connectDb(mem.getUri('illi-knows-e2e'));
await seedDatabase({ fakeUsers: 60 });

const app = createApp({
  config: {
    CORS_ORIGINS: [webOrigin],
    ALLOWED_EMAIL_DOMAIN: 'illinois.edu',
    REQUIRE_VERIFIED_EMAIL: true,
    DEMO_MODE: true,
    PUBLIC_WEB_URL: webOrigin
  },
  verifyToken: async () => {
    throw new Error('Firebase sign-in is not used in end-to-end tests.');
  },
  rateLimits: false
});

const server = app.listen(port, () => console.log(`e2e API ready on http://localhost:${port}`));
const stop = async () => {
  server.close();
  await mem.stop();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
