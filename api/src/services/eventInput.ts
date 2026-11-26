import type { Types } from 'mongoose';
import { z } from 'zod';
import { CATEGORIES, REMINDERS } from '@illi-knows/shared';
import { HttpError } from '../lib/errors.js';
import { campusTime, type DateParts } from '../lib/time.js';
import { objectId } from '../lib/validate.js';
import { Organization, Place, Rsvp, type UserDoc } from '../models/index.js';
import { reminderTime } from './rsvps.js';

const DAY = 86_400_000;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 19:00.');

export const EventBody = z
  .object({
    title: z.string().trim().min(1, 'Enter an event name.').max(120, 'Keep the name under 120 characters.'),
    description: z.string().trim().max(5000, 'Keep the description under 5,000 characters.').default(''),
    category: z.enum(CATEGORIES, 'Pick a category.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
    startTime: time,
    endTime: time,
    placeKey: z.string().trim().toLowerCase().max(80).nullable().default(null),
    locationDetail: z.string().trim().max(120, 'Keep the room or spot under 120 characters.').default(''),
    locationText: z.string().trim().max(200, 'Keep the location under 200 characters.').default(''),
    organizationId: objectId.nullable().default(null),
    isFree: z.boolean().default(true),
    priceDollars: z.number().min(0).max(10_000).nullable().default(null),
    priceNote: z.string().trim().max(80).default(''),
    submit: z.boolean().default(false)
  })
  .strict();
export type EventBody = z.infer<typeof EventBody>;


export const TipBody = EventBody.omit({ organizationId: true, submit: true }).extend({
  hostName: z.string().trim().min(1, 'Enter who is hosting it.').max(100)
});
export type TipBody = z.infer<typeof TipBody>;

/** The fields both forms share. Tips have no organization and are always "submitted". */
type FormBody = Omit<EventBody, 'organizationId' | 'submit'> & { organizationId?: Types.ObjectId | null; submit: boolean };

export function fieldError(field: keyof EventBody | 'hostName', message: string): HttpError {
  return new HttpError(400, 'invalid_request', message, { [field]: [message] });
}

/** Turns the form into the fields stored on the event. */
export async function toFields(user: UserDoc, body: FormBody, now: Date, opts: { hostName?: string } = {}) {
  const [year, month, day] = body.date.split('-').map(Number) as [number, number, number];
  const date: DateParts = { year, month, day };
  const [sh, sm] = body.startTime.split(':').map(Number) as [number, number];
  const [eh, em] = body.endTime.split(':').map(Number) as [number, number];
  if (body.endTime === body.startTime) throw fieldError('endTime', 'The end time has to be after the start time.');
  const startsAt = campusTime(date, sh, sm);
  let endsAt = campusTime(date, eh, em);
  if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + DAY);
  if (Number.isNaN(startsAt.getTime())) throw fieldError('date', 'Pick a date.');
  if (body.submit && startsAt <= now) throw fieldError('date', 'Pick a date and time in the future.');

  let place: { _id: Types.ObjectId; name: string } | null = null;
  if (body.placeKey) {
    place = await Place.findOne({ key: body.placeKey }).select('name').lean();
    if (!place) throw fieldError('placeKey', 'Pick a place from the list, or choose "Not on the campus map".');
  }
  const text = place ? (body.locationDetail ? `${place.name}, ${body.locationDetail}` : place.name) : body.locationText;

  let host: { organization?: Types.ObjectId; name: string } = { name: opts.hostName ?? user.name };
  if (body.organizationId) {
    const org = await Organization.findOne({ _id: body.organizationId, 'members.user': user._id }).select('name').lean();
    if (!org) throw new HttpError(403, 'forbidden', "You aren't a member of that organization.", { organizationId: ["You aren't a member of that organization."] });
    host = { organization: org._id, name: org.name };
  }

  if (!body.isFree && !body.priceDollars) throw fieldError('priceDollars', 'Enter a price, or mark the event as free.');

  return {
    title: body.title,
    description: body.description,
    category: body.category,
    startsAt,
    endsAt,
    location: { place: place?._id, detail: place ? body.locationDetail || undefined : undefined, text: text || undefined },
    host,
    price: body.isFree
      ? { isFree: true }
      : { isFree: false, amountCents: Math.round((body.priceDollars ?? 0) * 100), note: body.priceNote || undefined },
    flags: !place && !text ? [{ code: 'location_missing' as const, message: 'The event has no location.' }] : []
  };
}

/** Keeps reminders in step when an event moves. */
export async function rescheduleReminders(eventId: Types.ObjectId, startsAt: Date): Promise<void> {
  await Promise.all(
    REMINDERS.filter(r => r !== 'none').map(r => {
      const at = reminderTime(r, startsAt);
      return Rsvp.updateMany(
        { event: eventId, reminder: r },
        at ? { $set: { remindAt: at, reminderFailures: 0 }, $unset: { reminderSentAt: 1 } } : { $unset: { remindAt: 1 } }
      );
    })
  );
}
