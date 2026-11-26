import { Router } from 'express';
import type { Types } from 'mongoose';
import { FOUND_VIA, FOUND_VIA_LABELS, type EventStatus, type FoundVia, type InsightsDTO } from '@illi-knows/shared';
import { currentUser, requireUser } from '../auth/middleware.js';
import { HttpError, notFound, unauthorized } from '../lib/errors.js';
import { toOrganizerEvent, type LeanOrganizerEvent } from '../lib/organizerEvent.js';
import { objectId, parse } from '../lib/validate.js';
import { Event, Organization, Rsvp, User, type UserDoc } from '../models/index.js';
import { EventBody, rescheduleReminders, toFields } from '../services/eventInput.js';

const DAY = 86_400_000;

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
