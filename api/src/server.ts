import { createApp } from './app.js';
import { firebaseVerifier } from './auth/firebase.js';
import { loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';

const config = loadConfig();
await connectDb(config.MONGODB_URI);

const app = createApp({ config, verifyToken: firebaseVerifier(config), logRequests: config.NODE_ENV !== 'test' });
const server = app.listen(config.PORT, () => {
  console.log(`Illi-Knows API listening on port ${config.PORT} (${config.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
