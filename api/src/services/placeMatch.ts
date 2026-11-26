import type { Types } from 'mongoose';
import { Place } from '../models/index.js';

interface Candidate {
  id: Types.ObjectId;
  name: string;
  phrase: string;
}

const CACHE_MS = 10 * 60_000;
let cache: { at: number; candidates: Candidate[] } | null = null;

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function candidates(): Promise<Candidate[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.candidates;
  const places = await Place.find().select('name aliases').lean();
  const list: Candidate[] = [];
  for (const p of places) {
    for (const phrase of new Set([p.name, ...(p.aliases ?? [])].map(normalize))) {
      if (phrase.length >= 3) list.push({ id: p._id, name: p.name, phrase });
    }
  }
  // Longest phrases first, so "siebel center for design" wins over "siebel".
  list.sort((a, b) => b.phrase.length - a.phrase.length);
  cache = { at: Date.now(), candidates: list };
  return list;
}

export function clearPlaceCache(): void {
  cache = null;
}

/**
 * Finds the campus place a free-text location refers to, by its name or one of its aliases
 * appearing as whole words. "Union courtyard" matches the Illini Union through its "union" alias.
 * Returns the leftover words as the room or spot.
 */
export async function matchPlace(text: string | undefined | null): Promise<{ id: Types.ObjectId; name: string; detail: string } | null> {
  if (!text) return null;
  const haystack = ` ${normalize(text)} `;
  if (haystack.trim().length < 3) return null;
  for (const c of await candidates()) {
    const at = haystack.indexOf(` ${c.phrase} `);
    if (at >= 0) {
      const rest = (haystack.slice(0, at) + haystack.slice(at + c.phrase.length + 2)).replace(/\s+/g, ' ').trim();
      return { id: c.id, name: c.name, detail: rest };
    }
  }
  return null;
}
