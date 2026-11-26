import type { Types } from 'mongoose';
import { Event, Rsvp, User } from '../models/index.js';
import type { Mailer } from './mailer.js';
import { reminderEmail } from './reminderEmail.js';

export const MAX_FAILURES = 3;
const RETRY_MS = 10 * 60_000;

export interface ReminderRun {
  sent: number;
  skipped: number;
  failed: number;
  /** Stopped early because the batch limit was reached; the rest go out next run. */
  more: boolean;
}

export interface ReminderOptions {
  mailer: Mailer;
  webUrl: string;
  /** Only addresses at this domain get email, so seeded fake accounts never do. */
  allowedEmailDomain: string;
  now?: Date;
  limit?: number;
  log?: (line: string) => void;
}

/**
 * Sends every reminder that is due. Each RSVP is claimed with one atomic update before sending,
 * so two runs at the same time (the server's own timer and the scheduled job) never send twice.
 */
export async function sendDueReminders({ mailer, webUrl, allowedEmailDomain, now = new Date(), limit = 100, log = () => {} }: ReminderOptions): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, skipped: 0, failed: 0, more: false };
  // Cancelled RSVPs keep their reminder setting but should never be reminded.
  await Rsvp.updateMany({ remindAt: { $lte: now }, going: false }, { $unset: { remindAt: 1 } });

  for (let i = 0; i < limit; i++) {
    const claimed = await Rsvp.findOneAndUpdate(
      { remindAt: { $lte: now }, going: true },
      { $unset: { remindAt: 1 }, $set: { reminderSentAt: now } },
      { sort: { remindAt: 1 }, returnDocument: 'after' }
    ).lean();
    if (!claimed) return run;

    const skip = async (why: string) => {
      await Rsvp.updateOne({ _id: claimed._id }, { $unset: { reminderSentAt: 1 } });
      run.skipped++;
      log(`reminder ${String(claimed._id)} skipped: ${why}`);
    };

    const [user, event] = await Promise.all([
      User.findById(claimed.user).select('name email preferences').lean(),
      Event.findById(claimed.event).select('title startsAt endsAt status location.text host.name').lean()
    ]);
    if (!user || !event) {
      await skip('user or event is gone');
      continue;
    }
    if (event.status !== 'published') {
      await skip(`event is ${event.status}`);
      continue;
    }
    if (event.startsAt <= now) {
      await skip('event already started');
      continue;
    }
    if (user.preferences?.emailReminders === false) {
      await skip('reminder emails are off');
      continue;
    }
    if (!user.email.toLowerCase().endsWith(`@${allowedEmailDomain.toLowerCase()}`)) {
      await skip('not a campus address');
      continue;
    }

    try {
      await mailer.send(
        reminderEmail({
          to: user.email,
          name: user.name,
          event: {
            id: String(event._id as Types.ObjectId),
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            locationText: event.location?.text ?? '',
            hostName: event.host?.name ?? ''
          },
          webUrl,
          now
        })
      );
      await Rsvp.updateOne({ _id: claimed._id }, { $set: { reminderFailures: 0 } });
      run.sent++;
    } catch (err) {
      const failures = (claimed.reminderFailures ?? 0) + 1;
      const giveUp = failures >= MAX_FAILURES;
      await Rsvp.updateOne(
        { _id: claimed._id },
        giveUp
          ? { $unset: { reminderSentAt: 1 }, $set: { reminderFailures: failures } }
          : { $unset: { reminderSentAt: 1 }, $set: { reminderFailures: failures, remindAt: new Date(now.getTime() + RETRY_MS) } }
      );
      run.failed++;
      log(`reminder ${String(claimed._id)} failed (${failures}/${MAX_FAILURES}${giveUp ? ', giving up' : ''}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  run.more = !!(await Rsvp.exists({ remindAt: { $lte: now }, going: true }));
  return run;
}
