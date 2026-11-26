import type { Types } from 'mongoose';
import { Event } from '../models/index.js';
import { normalize } from './placeMatch.js';

const HOUR = 3_600_000;
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'at', 'in', 'on', 'for', 'with', 'night', 'nite']);

const words = (title: string) => new Set(normalize(title).split(' ').filter(w => w.length > 1 && !STOP.has(w)));

/** Share of distinct title words the two titles have in common. */
export function titleSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return normalize(a) === normalize(b) ? 1 : 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/**
 * Looks for a live or queued event that this listing probably repeats: starting within three hours,
 * and either with a similar title, or at the same place within an hour.
 */
export async function findDuplicate(listing: {
  title: string;
  startsAt: Date;
  place?: Types.ObjectId | null;
  exclude?: Types.ObjectId | null;
}): Promise<{ id: Types.ObjectId; title: string } | null> {
  const nearby = await Event.find({
    _id: { $ne: listing.exclude ?? undefined },
    status: { $in: ['published', 'in_review', 'changes_requested'] },
    startsAt: { $gte: new Date(listing.startsAt.getTime() - 3 * HOUR), $lte: new Date(listing.startsAt.getTime() + 3 * HOUR) }
  })
    .select('title startsAt status location.place')
    .lean();
  let best: { id: Types.ObjectId; title: string; score: number } | null = null;
  for (const e of nearby) {
    const similar = titleSimilarity(listing.title, e.title);
    const samePlace = !!listing.place && !!e.location?.place && e.location.place.equals(listing.place);
    const close = Math.abs(e.startsAt.getTime() - listing.startsAt.getTime()) <= HOUR;
    const base = similar >= 0.5 ? similar + (samePlace ? 0.5 : 0) : samePlace && close && similar > 0 ? 0.5 + similar : 0;
    // On a tie, point reviewers at the live event rather than another queued copy.
    const score = base > 0 && e.status === 'published' ? base + 0.01 : base;
    if (score > 0 && (!best || score > best.score)) best = { id: e._id, title: e.title, score };
  }
  return best && { id: best.id, title: best.title };
}
