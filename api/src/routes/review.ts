import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import {
  FEED_KINDS,
  REVIEW_ACTIONS,
  REVIEW_TABS,
  type FeedKind,
  type FlagCode,
  type SourceKind,
  type ReviewDecision,
  type ReviewItemDTO,
  type ReviewQueueDTO,
  type ReviewTab,
  type SourceSummaryDTO
} from '@illi-knows/shared';
import { currentUser, requireRole } from '../auth/middleware.js';
import { HttpError, notFound, unauthorized } from '../lib/errors.js';
import { toOrganizerEvent, type LeanOrganizerEvent } from '../lib/organizerEvent.js';
import { objectId, parse } from '../lib/validate.js';
import { Event, Source, type UserDoc } from '../models/index.js';
import { findDuplicate } from '../services/duplicates.js';
import { TipBody, toFields } from '../services/eventInput.js';

const DAY = 86_400_000;
/** "Approved" shows what was approved in the last two weeks. */
const APPROVED_WINDOW_MS = 14 * DAY;

interface Named {
  _id: Types.ObjectId;
  name?: string;
  title?: string;
}

interface LeanReviewEvent extends Omit<LeanOrganizerEvent, 'review' | 'createdBy' | 'source'> {
  createdBy?: Named | null;
  source?: { kind?: string | null; handle?: string | null; feed?: Named | null } | null;
  review?: {
    note?: string | null;
    flags?: { code: string; message?: string | null; relatedEvent?: Named | null }[] | null;
    history?: { decision: string; at?: Date | null; by?: Named | null; note?: string | null }[] | null;
  } | null;
}

function fromLabel(e: LeanReviewEvent): string {
  const kind = (e.source?.kind ?? 'organizer') as SourceKind;
  if (kind === 'organizer') {
    const who = e.createdBy?.name;
    return who ? (e.host.organization ? `Submitted by ${who}, ${e.host.name}` : `Submitted by ${who}`) : `Submitted by ${e.host.name}`;
  }
  if (kind === 'instagram') return `Instagram, ${e.source?.handle ?? e.host.name}`;
  if (kind === 'event_board') return `Event board, ${e.source?.feed?.name ?? e.host.name}`;
  return e.createdBy?.name ? `Word of mouth, entered by ${e.createdBy.name}` : 'Word of mouth';
}

export function toReviewItem(e: LeanReviewEvent, now = new Date()): ReviewItemDTO {
  const last = e.review?.history?.at(-1);
  return {
    ...toOrganizerEvent(
      { ...e, createdBy: e.createdBy?._id ?? null, source: e.source ? { kind: e.source.kind, handle: e.source.handle } : null, review: e.review } as LeanOrganizerEvent,
      now
    ),
    reviewNote: e.review?.note ?? null,
    from: fromLabel(e),
    flags: (e.review?.flags ?? []).map(f => ({
      code: f.code as FlagCode,
      message: f.message ?? '',
      relatedEvent: f.relatedEvent ? { id: String(f.relatedEvent._id), title: f.relatedEvent.title ?? '' } : null
    })),
    lastDecision: last
      ? { decision: last.decision as ReviewDecision, at: (last.at ?? now).toISOString(), by: last.by?.name ?? null, note: last.note ?? null }
      : null
  };
}

function tabFilter(tab: ReviewTab, now: Date): Record<string, unknown> {
  switch (tab) {
    case 'pending':
      return { status: 'in_review' };
    case 'approved':
      return { status: 'published', 'review.history': { $elemMatch: { decision: 'approved', at: { $gte: new Date(now.getTime() - APPROVED_WINDOW_MS) } } } };
    default:
      return { status: tab };
  }
}

async function loadItem(id: Types.ObjectId): Promise<LeanReviewEvent> {
  const e = await Event.findById(id)
    .populate('location.place', 'key name')
    .populate('createdBy', 'name')
    .populate('source.feed', 'name')
    .populate('review.flags.relatedEvent', 'title')
    .populate('review.history.by', 'name')
    .lean<LeanReviewEvent>();
  if (!e) throw notFound('Event not found.');
  return e;
}

const QueueQuery = z.object({ tab: z.enum(REVIEW_TABS).default('pending') });
const DecisionBody = z
  .object({
    action: z.enum(REVIEW_ACTIONS),
    note: z.string().trim().max(1000, 'Keep the note under 1,000 characters.').optional()
  })
  .strict();

function admin(res: Parameters<typeof currentUser>[0]): UserDoc {
  const user = currentUser(res);
  if (!user) throw unauthorized();
  return user;
}

export function reviewRouter(): Router {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/queue', async (req, res) => {
    const { tab } = parse(QueueQuery, req.query);
    const now = new Date();
    const [docs, ...counts] = await Promise.all([
      Event.find(tabFilter(tab, now))
        .sort(tab === 'pending' ? { startsAt: 1 } : { updatedAt: -1 })
        .limit(200)
        .populate('location.place', 'key name')
        .populate('createdBy', 'name')
        .populate('source.feed', 'name')
        .populate('review.flags.relatedEvent', 'title')
        .populate('review.history.by', 'name')
        .lean<LeanReviewEvent[]>(),
      ...REVIEW_TABS.map(t => Event.countDocuments(tabFilter(t, now)))
    ]);
    const body: ReviewQueueDTO = {
      tab,
      items: docs.map(e => toReviewItem(e, now)),
      counts: Object.fromEntries(REVIEW_TABS.map((t, i) => [t, counts[i] ?? 0])) as Record<ReviewTab, number>
    };
    res.json(body);
  });

  router.post('/events/:id/decision', async (req, res) => {
    const user = admin(res);
    const id = parse(objectId, req.params.id);
    const { action, note } = parse(DecisionBody, req.body);
    const e = await Event.findById(id).select('status publishedAt').lean();
    if (!e) throw notFound('Event not found.');
    const now = new Date();

    const allowed: Record<typeof action, string[]> = {
      approve: ['in_review'],
      request_changes: ['in_review'],
      reject: ['in_review'],
      reopen: ['published', 'changes_requested', 'rejected']
    };
    if (!allowed[action].includes(e.status)) {
      throw new HttpError(409, 'wrong_status', action === 'reopen' ? 'This listing is already pending.' : 'Only pending listings can be decided. Move it back to pending first.');
    }
    if (action === 'request_changes' && !note) {
      throw new HttpError(400, 'invalid_request', 'Tell the organizer what to change.', { note: ['Tell the organizer what to change.'] });
    }

    const entry = {
      approve: { decision: 'approved', status: 'published' },
      request_changes: { decision: 'changes_requested', status: 'changes_requested' },
      reject: { decision: 'rejected', status: 'rejected' },
      reopen: { decision: 'submitted', status: 'in_review' }
    }[action];
    const set: Record<string, unknown> = { status: entry.status };
    if (action === 'approve' && !e.publishedAt) set.publishedAt = now;
    if (action === 'request_changes' || action === 'reject') set['review.note'] = note ?? '';
    await Event.updateOne(
      { _id: id },
      {
        $set: set,
        ...(action === 'approve' || action === 'reopen' ? { $unset: { 'review.note': 1 } } : {}),
        $push: { 'review.history': { decision: entry.decision, by: user._id, note: action === 'reopen' ? 'Moved back to pending' : note, at: now } }
      }
    );
    res.json(toReviewItem(await loadItem(id)));
  });

  router.get('/sources', async (_req, res) => {
    const [sources, pending] = await Promise.all([
      Source.find({ active: true }).lean(),
      Event.aggregate<{ _id: string; n: number }>([{ $match: { status: 'in_review' } }, { $group: { _id: '$source.kind', n: { $sum: 1 } } }])
    ]);
    const waiting = new Map(pending.map(p => [p._id, p.n]));
    const body: SourceSummaryDTO[] = FEED_KINDS.map((kind: FeedKind) => {
      const list = sources.filter(s => s.kind === kind);
      const runs = list.map(s => s.lastRun?.at).filter((d): d is Date => !!d);
      const automatic = list.filter(s => s.mode === 'automatic');
      return {
        kind,
        label: { event_board: 'Event boards', instagram: 'Instagram accounts', word_of_mouth: 'Word of mouth' }[kind],
        mode: automatic.length ? 'automatic' : 'manual',
        sources: list.length,
        syncEveryMinutes: automatic.length ? Math.min(...automatic.map(s => s.syncEveryMinutes ?? 30)) : null,
        lastRunAt: runs.length ? new Date(Math.max(...runs.map(d => d.getTime()))).toISOString() : null,
        newListings: list.reduce((n, s) => n + (s.lastRun?.newListings ?? 0), 0),
        pending: waiting.get(kind) ?? 0,
        error: list.find(s => s.lastRun?.error)?.lastRun?.error ?? null
      };
    });
    res.json(body);
  });

  /** A word-of-mouth tip typed in by an admin. It joins the queue like any other listing. */
  router.post('/tips', async (req, res) => {
    const user = admin(res);
    const body = parse(TipBody, req.body);
    const now = new Date();
    const { flags, ...fields } = await toFields(user, { ...body, submit: true }, now, { hostName: body.hostName });
    const duplicate = await findDuplicate({ title: fields.title, startsAt: fields.startsAt, place: fields.location.place });
    const allFlags = [
      ...flags,
      ...(duplicate ? [{ code: 'possible_duplicate' as const, message: `Possible duplicate of ${duplicate.title}`, relatedEvent: duplicate.id }] : [])
    ];
    const feed = await Source.findOneAndUpdate(
      { kind: 'word_of_mouth', name: 'Flyers and tips' },
      { $set: { mode: 'manual', active: true, lastRun: { at: now, newListings: 1 } } },
      { upsert: true, returnDocument: 'after' }
    );
    const created = await Event.create({
      ...fields,
      createdBy: user._id,
      source: { kind: 'word_of_mouth', feed: feed._id },
      status: 'in_review',
      review: { flags: allFlags, history: [{ decision: 'submitted', by: user._id, at: now }] }
    });
    res.status(201).json(toReviewItem(await loadItem(created._id)));
  });

  return router;
}
