import { mongo, type Types } from 'mongoose';
import { REMINDER_MINUTES, type Reminder, type RsvpUpdate } from '@illi-knows/shared';
import { HttpError } from '../lib/errors.js';
import { Event, Rsvp, type UserDoc } from '../models/index.js';

export async function refreshEventStats(eventId: Types.ObjectId): Promise<void> {
  const [going, anonymous, checkedIn] = await Promise.all([
    Rsvp.countDocuments({ event: eventId, going: true }),
    Rsvp.countDocuments({ event: eventId, going: true, anonymous: true }),
    Rsvp.countDocuments({ event: eventId, going: true, checkedInAt: { $exists: true } })
  ]);
  await Event.updateOne(
    { _id: eventId },
    { $set: { 'stats.goingCount': going, 'stats.anonymousCount': anonymous, 'stats.checkInCount': checkedIn } }
  );
}

export function reminderTime(reminder: Reminder, startsAt: Date, now = new Date()): Date | null {
  if (reminder === 'none') return null;
  const at = new Date(startsAt.getTime() - REMINDER_MINUTES[reminder] * 60_000);
  return at > now ? at : null;
}

export async function updateRsvp(user: UserDoc, eventId: Types.ObjectId, change: RsvpUpdate, attempt = 0): Promise<void> {
  const event = await Event.findOne({ _id: eventId, status: 'published' }).select('startsAt endsAt').lean();
  if (!event) throw new HttpError(404, 'not_found', 'Event not found.');
  const now = new Date();
  if (change.going === true && event.endsAt < now) {
    throw new HttpError(409, 'event_ended', 'This event already ended, so it no longer takes RSVPs.');
  }

  const existing = await Rsvp.findOne({ user: user._id, event: eventId });
  const doc =
    existing ??
    new Rsvp({
      user: user._id,
      event: eventId,
      going: false,
      anonymous: user.preferences?.rsvpAnonymously ?? false,
      reminder: change.going ? (user.preferences?.defaultReminder ?? 'none') : 'none'
    });

  if (change.going !== undefined && change.going !== doc.going) {
    doc.going = change.going;
    if (change.going) doc.cancelledAt = undefined;
    else doc.cancelledAt = now;
  }
  if (change.anonymous !== undefined) doc.anonymous = change.anonymous;
  if (change.inCalendar !== undefined) doc.inCalendar = change.inCalendar;
  if (change.foundVia && !doc.foundVia) doc.foundVia = change.foundVia;
  if (change.reminder !== undefined) doc.reminder = change.reminder;

  const remindAt = reminderTime(doc.reminder as Reminder, event.startsAt, now);
  if (remindAt && (!doc.remindAt || doc.remindAt.getTime() !== remindAt.getTime())) {
    doc.remindAt = remindAt;
    doc.reminderSentAt = undefined;
  } else if (!remindAt) {
    doc.remindAt = undefined;
  }

  try {
    await doc.save();
  } catch (err) {
    if (!existing && attempt === 0 && err instanceof mongo.MongoServerError && err.code === 11000) {
      return updateRsvp(user, eventId, change, 1);
    }
    throw err;
  }
  await refreshEventStats(eventId);
}
