import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  CATEGORIES,
  FOUND_VIA,
  FOUND_VIA_LABELS,
  REMINDERS,
  type EventStatus,
  type FoundVia,
  type InsightsDTO,
  type OrganizerEventDTO
} from '@illi-knows/shared';
import { currentUser, requireUser } from '../auth/middleware.js';
import { HttpError, notFound, unauthorized } from '../lib/errors.js';
import { toEventSummary, type LeanEvent } from '../lib/serialize.js';
import { campusTime, type DateParts } from '../lib/time.js';
import { objectId, parse } from '../lib/validate.js';
import { Event, Organization, Place, Rsvp, User, type UserDoc } from '../models/index.js';
import { reminderTime } from '../services/rsvps.js';

const DAY = 86_400_000;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 19:00.');

const EventBody = z
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
type EventBody = z.infer<typeof EventBody>;

interface LeanOrganizerEvent extends LeanEvent {
  description?: string | null;
  review?: { note?: string | null; history?: { decision: string; at?: Date | null }[] | null } | null;
  stats?: { goingCount?: number | null; anonymousCount?: number | null; checkInCount?: number | null; viewCount?: number | null } | null;
  updatedAt?: Date | null;
}

function fieldError(field: keyof EventBody, message: string): HttpError {
  return new HttpError(400, 'invalid_request', message, { [field]: [message] });
}

export function toOrganizerEvent(e: LeanOrganizerEvent, now = new Date()): OrganizerEventDTO {
  const ended = e.endsAt < now;
  const status = e.status as EventStatus;
  const submitted = [...(e.review?.history ?? [])].reverse().find(h => h.decision === 'submitted');
  return {
    ...toEventSummary(e),
    status,
    description: e.description ?? '',
    ended,
    reviewNote: status === 'changes_requested' || status === 'rejected' ? (e.review?.note ?? null) : null,
    stats: {
      going: e.stats?.goingCount ?? 0,
      anonymous: e.stats?.anonymousCount ?? 0,
      checkedIn: e.stats?.checkInCount ?? 0,
      views: e.stats?.viewCount ?? 0
    },
    submittedAt: submitted?.at?.toISOString() ?? null,
    updatedAt: (e.updatedAt ?? e.startsAt).toISOString(),
    editable: !ended && status !== 'rejected' && status !== 'cancelled'
  };
}

function me(res: Parameters<typeof currentUser>[0]): UserDoc {
  const user = currentUser(res);
  if (!user) throw unauthorized();
  return user;
}

async function scopeFor(user: UserDoc): Promise<Record<string, unknown>> {
  const orgIds = await Organization.find({ 'members.user': user._id }).distinct('_id');
  return { $or: [{ createdBy: user._id }, { 'host.organization': { $in: orgIds } }] };
}

async function loadManaged(user: UserDoc, id: Types.ObjectId): Promise<LeanOrganizerEvent> {
  const e = await Event.findOne({ _id: id, ...(await scopeFor(user)) })
    .populate('location.place', 'key name')
    .lean<LeanOrganizerEvent>();
  if (!e) throw notFound('Event not found.');
  return e;
}

/** Turns the form into the fields stored on the event. */
async function toFields(user: UserDoc, body: EventBody, now: Date) {
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

  let host: { organization?: Types.ObjectId; name: string } = { name: user.name };
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
    flags: !place && !text ? [{ code: 'location_missing', message: 'The event has no location.' }] : []
  };
}

/** Keeps reminders in step when an event moves. */
async function rescheduleReminders(eventId: Types.ObjectId, startsAt: Date): Promise<void> {
  await Promise.all(
    REMINDERS.filter(r => r !== 'none').map(r => {
      const at = reminderTime(r, startsAt);
      return Rsvp.updateMany(
        { event: eventId, reminder: r },
        at ? { $set: { remindAt: at }, $unset: { reminderSentAt: 1 } } : { $unset: { remindAt: 1 } }
      );
    })
  );
}

export function organizerRouter(): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/events', async (_req, res) => {
    const user = me(res);
    const docs = await Event.find(await scopeFor(user))
      .sort({ startsAt: -1 })
      .limit(300)
      .populate('location.place', 'key name')
      .lean<LeanOrganizerEvent[]>();
    const now = new Date();
    res.json(docs.map(e => toOrganizerEvent(e, now)));
  });

  router.get('/events/:id', async (req, res) => {
    res.json(toOrganizerEvent(await loadManaged(me(res), parse(objectId, req.params.id))));
  });

  router.post('/events', async (req, res) => {
    const user = me(res);
    const body = parse(EventBody, req.body);
    const now = new Date();
    const { flags, ...fields } = await toFields(user, body, now);
    const status: EventStatus = body.submit ? 'in_review' : 'draft';
    const created = await Event.create({
      ...fields,
      createdBy: user._id,
      source: { kind: 'organizer' },
      status,
      review: { flags, history: body.submit ? [{ decision: 'submitted', by: user._id, at: now }] : [] }
    });
    if (!user.roles.includes('organizer')) await User.updateOne({ _id: user._id }, { $addToSet: { roles: 'organizer' } });
    res.status(201).json(toOrganizerEvent(await loadManaged(user, created._id)));
  });

  router.put('/events/:id', async (req, res) => {
    const user = me(res);
    const id = parse(objectId, req.params.id);
    const existing = await loadManaged(user, id);
    const now = new Date();
    if (existing.endsAt < now) throw new HttpError(409, 'event_ended', "This event has ended, so it can't be edited.");
    if (existing.status === 'rejected' || existing.status === 'cancelled') {
      throw new HttpError(409, 'not_editable', `This event was ${existing.status}, so it can't be edited.`);
    }
    const body = parse(EventBody, req.body);
    // Live or waiting events always go back to review; drafts and returned events can stay as they are.
    const submit = body.submit || existing.status === 'published' || existing.status === 'in_review';
    const { flags, ...fields } = await toFields(user, { ...body, submit }, now);
    const status: EventStatus = submit ? 'in_review' : (existing.status as EventStatus);
    const update: Record<string, unknown> = {
      // Hosting as yourself makes you the owner, so you keep access once the organization is removed.
      $set: { ...fields, status, 'review.flags': flags, ...(fields.host.organization ? {} : { createdBy: user._id }) },
      ...(submit ? { $push: { 'review.history': { decision: 'submitted', by: user._id, at: now } } } : {})
    };
    await Event.updateOne({ _id: id }, update, { runValidators: true });
    if (fields.startsAt.getTime() !== existing.startsAt.getTime()) await rescheduleReminders(id, fields.startsAt);
    res.json(toOrganizerEvent(await loadManaged(user, id)));
  });

  router.delete('/events/:id', async (req, res) => {
    const user = me(res);
    const id = parse(objectId, req.params.id);
    await loadManaged(user, id);
    await Rsvp.deleteMany({ event: id });
    await Event.deleteOne({ _id: id });
    res.status(204).end();
  });

  router.get('/events/:id/insights', async (req, res) => {
    const user = me(res);
    const id = parse(objectId, req.params.id);
    const e = await loadManaged(user, id);
    const rsvps = await Rsvp.find({ event: id, going: true }).select('createdAt foundVia').lean<{ createdAt: Date; foundVia?: FoundVia | null }[]>();

    const byDay = new Array<number>(14).fill(0);
    let earlier = 0;
    for (const r of rsvps) {
      const daysBefore = Math.max(0, Math.floor((e.startsAt.getTime() - r.createdAt.getTime()) / DAY));
      if (daysBefore < 14) byDay[daysBefore]! += 1;
      else earlier += 1;
    }
    const via = new Map<FoundVia, number>();
    for (const r of rsvps) via.set(r.foundVia ?? 'other', (via.get(r.foundVia ?? 'other') ?? 0) + 1);

    const past = await Event.find({ ...(await scopeFor(user)), status: 'published', endsAt: { $lt: new Date() } })
      .sort({ startsAt: -1 })
      .limit(8)
      .select('title startsAt stats')
      .lean<LeanOrganizerEvent[]>();

    const body: InsightsDTO = {
      event: toOrganizerEvent(e),
      rsvpsByDay: byDay.map((count, daysBefore) => ({ daysBefore, count })).reverse(),
      earlier,
      foundVia: FOUND_VIA.map(v => ({ label: FOUND_VIA_LABELS[v], value: via.get(v) ?? 0 }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value),
      past: past.reverse().map(p => ({
        id: String(p._id),
        title: p.title,
        startsAt: p.startsAt.toISOString(),
        going: p.stats?.goingCount ?? 0,
        checkedIn: p.stats?.checkInCount ?? 0
      }))
    };
    res.json(body);
  });

  return router;
}
