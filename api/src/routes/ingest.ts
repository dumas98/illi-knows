import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { CATEGORIES, FEED_KINDS, type FlagCode, type IngestResponse, type IngestResult } from '@illi-knows/shared';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { Event, Organization, Source } from '../models/index.js';
import { findDuplicate } from '../services/duplicates.js';
import { matchPlace } from '../services/placeMatch.js';

const HOUR = 3_600_000;
export const MAX_LISTINGS = 200;

const isoDate = z.iso.datetime({ offset: true, message: 'Use an ISO 8601 date with an offset, like 2026-12-03T19:00:00-06:00.' });

const Envelope = z
  .object({
    source: z
      .object({
        kind: z.enum(FEED_KINDS),
        name: z.string().trim().min(1).max(100),
        handle: z.string().trim().toLowerCase().max(60).transform(h => h.replace(/^@/, '')).optional(),
        url: z.url().max(500).optional()
      })
      .strict(),
    listings: z.array(z.unknown()).min(1).max(MAX_LISTINGS, `Send at most ${MAX_LISTINGS} listings per request.`)
  })
  .strict();

const Listing = z
  .object({
    externalId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(5000).default(''),
    category: z.enum(CATEGORIES),
    startsAt: isoDate,
    endsAt: isoDate.optional(),
    location: z.string().trim().max(200).optional(),
    hostName: z.string().trim().max(100).optional(),
    price: z
      .object({ isFree: z.boolean(), amountCents: z.number().int().min(0).max(1_000_000).optional(), note: z.string().trim().max(80).optional() })
      .strict()
      .optional(),
    url: z.url().max(500).optional(),
    dateFromImage: z.boolean().optional(),
    maybeNotEvent: z.boolean().optional()
  })
  .strict();

function requireKey(apiKey: string | undefined): RequestHandler {
  return (req, _res, next) => {
    if (!apiKey) throw new HttpError(503, 'ingest_disabled', 'Ingestion is not set up on this server. Set INGEST_API_KEY.');
    const given = Buffer.from(req.get('x-api-key') ?? '');
    const expected = Buffer.from(apiKey);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(401, 'bad_api_key', 'Send the ingestion key in the X-Api-Key header.');
    }
    next();
  };
}

export function ingestRouter({ apiKey }: { apiKey?: string }): Router {
  const router = Router();
  router.use(requireKey(apiKey));

  router.post('/listings', async (req, res) => {
    const env = parse(Envelope, req.body);
    const now = new Date();
    const handle = env.source.kind === 'instagram' ? env.source.handle : undefined;
    const sourceKey = handle ? { kind: env.source.kind, handle } : { kind: env.source.kind, name: env.source.name };
    const source = await Source.findOneAndUpdate(
      sourceKey,
      { $set: { name: env.source.name, ...(env.source.url ? { url: env.source.url } : {}), active: true }, $setOnInsert: { mode: env.source.kind === 'event_board' ? 'automatic' : 'manual' } },
      { upsert: true, returnDocument: 'after' }
    );
    const org = handle ? await Organization.findOne({ instagramHandle: handle }).select('name').lean() : null;

    const results: IngestResponse['results'] = [];
    for (const raw of env.listings) {
      const externalId = typeof raw === 'object' && raw && 'externalId' in raw ? String((raw as { externalId: unknown }).externalId) : '';
      const parsed = Listing.safeParse(raw);
      if (!parsed.success) {
        results.push({ externalId, result: 'invalid', eventId: null, flags: [], errors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> });
        continue;
      }
      const l = parsed.data;
      const startsAt = new Date(l.startsAt);
      const endsAt = l.endsAt ? new Date(l.endsAt) : new Date(startsAt.getTime() + 2 * HOUR);
      if (endsAt <= startsAt) {
        results.push({ externalId, result: 'invalid', eventId: null, flags: [], errors: { endsAt: ['endsAt must be after startsAt.'] } });
        continue;
      }

      const existing = await Event.findOne({ 'source.kind': env.source.kind, 'source.externalId': l.externalId }).select('status').lean();
      if (existing && !['in_review', 'changes_requested'].includes(existing.status)) {
        results.push({ externalId, result: 'unchanged', eventId: String(existing._id), flags: [], reason: `Already ${existing.status.replace('_', ' ')}. Reviewed listings aren't overwritten.` });
        continue;
      }

      const place = await matchPlace(l.location);
      const flags: { code: FlagCode; message: string; relatedEvent?: Types.ObjectId }[] = [];
      if (!place) flags.push({ code: 'location_missing', message: l.location ? `Couldn't find "${l.location}" on the campus map` : 'Location missing' });
      const duplicate = await findDuplicate({ title: l.title, startsAt, place: place?.id, exclude: existing?._id });
      if (duplicate) flags.push({ code: 'possible_duplicate', message: `Possible duplicate of ${duplicate.title}`, relatedEvent: duplicate.id });
      if (l.dateFromImage) flags.push({ code: 'date_from_image', message: 'Date was read from an image. Check it.' });
      if (l.maybeNotEvent) flags.push({ code: 'not_an_event', message: 'May not be an event' });
      if (startsAt < now) flags.push({ code: 'other', message: 'Starts in the past' });

      const fields = {
        title: l.title,
        description: l.description,
        category: l.category,
        startsAt,
        endsAt,
        location: place
          ? { place: place.id, detail: place.detail || undefined, text: l.location }
          : { text: l.location || undefined },
        host: org ? { organization: org._id, name: org.name } : { name: l.hostName || env.source.name },
        price: l.price ?? { isFree: true },
        source: { kind: env.source.kind, feed: source._id, handle: handle ? `@${handle}` : undefined, url: l.url, externalId: l.externalId },
        status: 'in_review' as const,
        'review.flags': flags
      };

      if (existing) {
        await Event.updateOne({ _id: existing._id }, place ? { $set: fields } : { $set: fields, $unset: { 'location.place': 1 } }, { runValidators: true });
        results.push({ externalId, result: 'updated', eventId: String(existing._id), flags: flags.map(f => f.code) });
      } else {
        const { 'review.flags': reviewFlags, ...rest } = fields;
        const created = await Event.create({ ...rest, review: { flags: reviewFlags, history: [{ decision: 'submitted', at: now }] } });
        results.push({ externalId, result: 'created', eventId: String(created._id), flags: flags.map(f => f.code) });
      }
    }

    const counts = { created: 0, updated: 0, unchanged: 0, invalid: 0 } as Record<IngestResult, number>;
    for (const r of results) counts[r.result]++;
    await Source.updateOne({ _id: source._id }, { $set: { lastRun: { at: now, newListings: counts.created, ...(counts.invalid ? { error: `${counts.invalid} invalid listings` } : {}) } } });

    const body: IngestResponse = { source: { id: String(source._id), name: source.name }, counts, results };
    res.json(body);
  });

  return router;
}
