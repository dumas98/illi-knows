import { Router } from 'express';
import { requireApiKey } from '../lib/apiKey.js';
import type { Mailer } from '../services/mailer.js';
import { sendDueReminders } from '../services/reminders.js';

/** Endpoints a scheduler calls. The free Render server sleeps, so a GitHub Action wakes it every 10 minutes. */
export function jobsRouter({ apiKey, mailer, webUrl, allowedEmailDomain }: { apiKey?: string; mailer: Mailer; webUrl: string; allowedEmailDomain: string }): Router {
  const router = Router();
  router.use(requireApiKey(apiKey, 'x-jobs-key', 'JOBS_API_KEY'));

  router.post('/reminders', async (_req, res) => {
    const run = await sendDueReminders({ mailer, webUrl, allowedEmailDomain, log: line => console.log(line) });
    res.json({ mailer: mailer.name, ...run });
  });

  return router;
}
