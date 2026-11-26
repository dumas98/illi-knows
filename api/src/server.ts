import { createApp } from './app.js';
import { firebaseVerifier } from './auth/firebase.js';
import { loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { mailerFromConfig } from './services/mailer.js';
import { sendDueReminders } from './services/reminders.js';

const config = loadConfig();
await connectDb(config.MONGODB_URI);

const mailer = mailerFromConfig(config);
const app = createApp({ config, mailer, verifyToken: firebaseVerifier(config), logRequests: config.NODE_ENV !== 'test' });
const server = app.listen(config.PORT, () => {
  console.log(`Illi-Knows API listening on port ${config.PORT} (${config.NODE_ENV}), email via ${mailer.name}`);
});

// While the server is awake, check for due reminders every minute. The scheduled GitHub Action
// covers the time the free Render server is asleep.
let checking = false;
const reminderTimer =
  config.REMINDER_INTERVAL_SECONDS > 0
    ? setInterval(async () => {
        if (checking) return;
        checking = true;
        try {
          const run = await sendDueReminders({
            mailer,
            webUrl: config.PUBLIC_WEB_URL,
            allowedEmailDomain: config.ALLOWED_EMAIL_DOMAIN,
            log: line => console.log(line)
          });
          if (run.sent || run.failed) console.log(`reminders: ${run.sent} sent, ${run.failed} failed, ${run.skipped} skipped`);
        } catch (err) {
          console.error('reminder check failed', err);
        } finally {
          checking = false;
        }
      }, config.REMINDER_INTERVAL_SECONDS * 1000)
    : null;
reminderTimer?.unref();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  if (reminderTimer) clearInterval(reminderTimer);
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
