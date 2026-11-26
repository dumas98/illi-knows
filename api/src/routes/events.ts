import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { CATEGORIES, FOUND_VIA, REMINDERS, SOURCE_KINDS, type AttendeesDTO, type EventDetailDTO, type EventSummaryDTO, type Page } from '@illi-knows/shared';
import { currentUser, requireUser } from '../auth/middleware.js';
import { HttpError, notFound, unauthorized } from '../lib/errors.js';
import { toIcs } from '../lib/ics.js';
import { toEventDetail, toEventSummary, toViewer, type LeanEvent, type LeanRsvp } from '../lib/serialize.js';
import { objectId, parse } from '../lib/validate.js';
import { Event, Organization, Place, Rsvp, type UserDoc } from '../models/index.js';
import { updateRsvp } from '../services/rsvps.js';
import { initials } from '../services/users.js';

const ListQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  category: z.enum(CATEGORIES).optional(),
  source: z.enum(SOURCE_KINDS).optional(),
  free: z.stringbool().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  place: z.string().trim().toLowerCase().max(40).optional(),
  includePast: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional()
});

const RsvpBody = z
  .object({
    going: z.boolean().optional(),
    anonymous: z.boolean().optional(),
    inCalendar: z.boolean().optional(),
    reminder: z.enum(REMINDERS).optional(),
    foundVia: z.enum(FOUND_VIA).optional()
  })
  .strict();

const AttendeesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

function encodeCursor(e: { startsAt: Date; _id: Types.ObjectId }): string {
  return Buffer.from(`${e.startsAt.getTime()}:${String(e._id)}`).toString('base64url');
}

function decodeCursor(cursor: string): { startsAt: Date; id: Types.ObjectId } {
  const [ms, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');
  const startsAt = new Date(Number(ms));
  if (!id || Number.isNaN(startsAt.getTime()) || !Types.ObjectId.isValid(id)) {
    throw new HttpError(400, 'invalid_request', 'Invalid cursor.');
  }
  return { startsAt, id: new Types.ObjectId(id) };
}

async function viewerRsvps(user: UserDoc | undefined, eventIds: Types.ObjectId[]): Promise<Map<string, LeanRsvp>> {
  if (!user || eventIds.length === 0) return new Map();
  const rows = await Rsvp.find({ user: user._id, event: { $in: eventIds } }).lean<LeanRsvp[]>();
  return new Map(rows.map(r => [String(r.event), r]));
}

export async function canManage(user: UserDoc | undefined, e: LeanEvent): Promise<boolean> {
  if (!user) return false;
  if (user.roles.includes('admin')) return true;
  if (e.createdBy && e.createdBy.equals(user._id)) return true;
  if (!e.host.organization) return false;
  return !!(await Organization.exists({ _id: e.host.organization, 'members.user': user._id }));
}

async function loadVisible(id: Types.ObjectId, user: UserDoc | undefined): Promise<LeanEvent> {
  const e = await Event.findById(id).populate('location.place', 'key name').lean<LeanEvent>();
  if (!e || (e.status !== 'published' && !(await canManage(user, e)))) throw notFound('Event not found.');
  return e;
}

async function detailFor(id: Types.ObjectId, user: UserDoc | undefined): Promise<EventDetailDTO> {
  const e = await loadVisible(id, user);
  const rsvp = user ? await Rsvp.findOne({ user: user._id, event: id }).lean<LeanRsvp>() : null;
  return toEventDetail(e, toViewer(rsvp));
}

export function eventsRouter({ webUrl }: { webUrl: string }): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = parse(ListQuery, req.query);
    const filter: Record<string, unknown> = { status: 'published' };
    const startsAt: Record<string, Date> = {};
    if (!q.includePast) filter.endsAt = { $gte: new Date() };
    if (q.from) startsAt.$gte = q.from;
    if (q.to) startsAt.$lt = q.to;
    if (Object.keys(startsAt).length) filter.startsAt = startsAt;
    if (q.category) filter.category = q.category;
    if (q.source) filter['source.kind'] = q.source;
    if (q.free) filter['price.isFree'] = true;
    if (q.q) filter.$text = { $search: q.q };
    if (q.place) {
      const place = await Place.findOne({ key: q.place }).select('_id').lean();
      if (!place) {
        const empty: Page<EventSummaryDTO> = { items: [], nextCursor: null };
        return void res.json(empty);
      }
      filter['location.place'] = place._id;
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      filter.$or = [{ startsAt: { $gt: c.startsAt } }, { startsAt: c.startsAt, _id: { $gt: c.id } }];
    }

    const docs = await Event.find(filter)
      .sort({ startsAt: 1, _id: 1 })
      .limit(q.limit + 1)
      .populate('location.place', 'key name')
      .lean<LeanEvent[]>();
    const items = docs.slice(0, q.limit);
    const last = items.at(-1);
    const viewers = await viewerRsvps(currentUser(res), items.map(e => e._id));
    const body: Page<EventSummaryDTO> = {
      items: items.map(e => toEventSummary(e, toViewer(viewers.get(String(e._id))))),
      nextCursor: docs.length > q.limit && last ? encodeCursor(last) : null
    };
    res.json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const user = currentUser(res);
    const e = await loadVisible(id, user);
    if (e.status === 'published') await Event.updateOne({ _id: id }, { $inc: { 'stats.viewCount': 1 } });
    const rsvp = user ? await Rsvp.findOne({ user: user._id, event: id }).lean<LeanRsvp>() : null;
    res.json(toEventDetail(e, toViewer(rsvp)));
  });

  router.put('/:id/rsvp', requireUser, async (req, res) => {
    const id = parse(objectId, req.params.id);
    const user = currentUser(res);
    if (!user) throw unauthorized();
    await updateRsvp(user, id, parse(RsvpBody, req.body ?? {}));
    res.json(await detailFor(id, user));
  });

  router.delete('/:id/rsvp', requireUser, async (req, res) => {
    const id = parse(objectId, req.params.id);
    const user = currentUser(res);
    if (!user) throw unauthorized();
    await updateRsvp(user, id, { going: false });
    res.json(await detailFor(id, user));
  });

  router.get('/:id/ics', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const e = await loadVisible(id, currentUser(res));
    const place = e.location?.place && 'name' in e.location.place ? e.location.place.name : '';
    const body = toIcs({
      id: String(e._id),
      title: e.title,
      description: e.description ?? '',
      location: e.location?.text || place,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      url: `${webUrl.replace(/\/$/, '')}/events/${String(e._id)}`
    });
    const filename = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}.ics"`);
    res.send(body);
  });

  router.get('/:id/attendees', async (req, res) => {
    const id = parse(objectId, req.params.id);
    const { limit } = parse(AttendeesQuery, req.query);
    const e = await loadVisible(id, currentUser(res));
    const rows = await Rsvp.find({ event: id, going: true, anonymous: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'name')
      .lean<{ user: { _id: Types.ObjectId; name: string } | null }[]>();
    const body: AttendeesDTO = {
      total: e.stats?.goingCount ?? 0,
      shown: rows.flatMap(r => (r.user ? [{ id: String(r.user._id), name: r.user.name, initials: initials(r.user.name) }] : []))
    };
    res.json(body);
  });

  return router;
}
