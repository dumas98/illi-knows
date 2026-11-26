import type { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EventSummaryDTO, IngestResponse, Page, ReviewItemDTO, ReviewQueueDTO, SourceSummaryDTO, TipInput } from '@illi-knows/shared';
import { createApp } from '../src/app.js';
import { addDays, campusDay } from '../src/lib/time.js';
import { Event, Source, User } from '../src/models/index.js';
import { seedDatabase } from '../src/seed/seed.js';
import { INGEST_KEY, auth, fakeVerifier, startDb, stopDb, testApp } from './setup.js';

let mem: MongoMemoryServer;
const app = testApp();
const DAY = 86_400_000;

const queue = async (tab = 'pending') => (await request(app).get(`/api/review/queue?tab=${tab}`).set(auth('admin'))).body as ReviewQueueDTO;
const decide = (id: string, action: string, note?: string) =>
  request(app).post(`/api/review/events/${id}/decision`).set(auth('admin')).send(note === undefined ? { action } : { action, note });
const byTitle = (q: ReviewQueueDTO, title: string) => q.items.find(i => i.title === title)!;
const isPublic = async (id: string) => (await request(app).get(`/api/events/${id}`)).status === 200;

const dayString = (offset: number) => {
  const d = addDays(campusDay(), offset);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
};

beforeAll(async () => {
  mem = await startDb();
  await seedDatabase({ fakeUsers: 40 });
  await request(app).get('/api/me').set(auth('admin'));
  await request(app).get('/api/me').set(auth('student'));
  await User.updateOne({ email: 'sam.admin@illinois.edu' }, { $addToSet: { roles: 'admin' } });
});

afterAll(async () => {
  await stopDb(mem);
});

describe('Review queue', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/review/queue')).status).toBe(401);
    expect((await request(app).get('/api/review/queue').set(auth('student'))).status).toBe(403);
  });

  it('lists pending listings with where they came from and what to check', async () => {
    const q = await queue();
    expect(q.tab).toBe('pending');
    expect(q.counts.pending).toBe(q.items.length);
    expect(q.items.every(i => i.status === 'in_review')).toBe(true);
    expect(byTitle(q, 'Vinyl swap meet').from).toBe('Submitted by Tim Okafor, Campus Radio');
    expect(byTitle(q, 'Free pizza and club fair')).toMatchObject({ from: 'Instagram, @campus_life', flags: [{ code: 'location_missing' }] });
    const dup = byTitle(q, 'Open mic nite').flags[0]!;
    expect(dup.code).toBe('possible_duplicate');
    expect(dup.relatedEvent?.title).toBe('Open mic night');
    expect(byTitle(q, 'Yoga on the quad').from).toMatch(/^Event board, /);
  });

  it('approves a listing, which makes it public', async () => {
    const item = byTitle(await queue(), 'Yoga on the quad');
    expect(await isPublic(item.id)).toBe(false);
    const res = await decide(item.id, 'approve');
    expect(res.status).toBe(200);
    expect((res.body as ReviewItemDTO)).toMatchObject({ status: 'published', lastDecision: { decision: 'approved', by: 'Sam Admin' } });
    expect(await isPublic(item.id)).toBe(true);
    expect((await queue('approved')).items.map(i => i.id)).toContain(item.id);
    expect((await decide(item.id, 'approve')).status).toBe(409);
  });

  it('needs a note to request changes, and shows the note', async () => {
    const item = byTitle(await queue(), 'Vinyl swap meet');
    const missing = await decide(item.id, 'request_changes');
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.note).toBeTruthy();
    const res = await decide(item.id, 'request_changes', 'Add the room number');
    expect(res.body).toMatchObject({ status: 'changes_requested', reviewNote: 'Add the room number' });
    expect((await queue('changes_requested')).items.map(i => i.id)).toContain(item.id);
  });

  it('rejects, and moves listings back to pending (which unpublishes them)', async () => {
    const pizza = byTitle(await queue(), 'Free pizza and club fair');
    expect((await decide(pizza.id, 'reject', 'Not enough detail')).body.status).toBe('rejected');
    const back = await decide(pizza.id, 'reopen');
    expect(back.body).toMatchObject({ status: 'in_review', reviewNote: null, lastDecision: { decision: 'submitted', note: 'Moved back to pending' } });
    expect((await decide(pizza.id, 'reopen')).status).toBe(409);

    const yoga = byTitle(await queue('approved'), 'Yoga on the quad');
    await decide(yoga.id, 'reopen');
    expect(await isPublic(yoga.id)).toBe(false);
  });

  it('summarizes the three kinds of sources', async () => {
    const res = await request(app).get('/api/review/sources').set(auth('admin'));
    const sources = res.body as SourceSummaryDTO[];
    expect(sources.map(s => s.kind)).toEqual(['event_board', 'instagram', 'word_of_mouth']);
    const boards = sources[0]!;
    expect(boards).toMatchObject({ mode: 'automatic', syncEveryMinutes: 30 });
    expect(boards.lastRunAt).not.toBeNull();
    expect(sources[1]!.pending).toBeGreaterThan(0);
  });
});

describe('Word-of-mouth tips', () => {
  const tip = (extra: Partial<TipInput> = {}): TipInput => ({
    title: 'Lantern walk',
    description: 'Seen on a flyer at the Union.',
    category: 'Arts',
    date: dayString(4),
    startTime: '18:00',
    endTime: '19:00',
    placeKey: 'main-quad',
    locationDetail: 'South end',
    locationText: '',
    isFree: true,
    priceDollars: null,
    priceNote: '',
    hostName: 'Lantern Society',
    ...extra
  });

  it('adds a tip to the pending queue', async () => {
    const res = await request(app).post('/api/review/tips').set(auth('admin')).send(tip());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'in_review', source: { kind: 'word_of_mouth' }, host: { name: 'Lantern Society' }, from: 'Word of mouth, entered by Sam Admin', flags: [] });
    expect((await request(app).post('/api/review/tips').set(auth('student')).send(tip())).status).toBe(403);
  });

  it('flags a tip that repeats an existing event', async () => {
    const live = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + DAY) } }).populate('location.place', 'key').lean();
    const at = new Date(live!.startsAt);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const get = (t: string) => parts.find(p => p.type === t)!.value;
    const res = await request(app)
      .post('/api/review/tips')
      .set(auth('admin'))
      .send(tip({ title: live!.title, date: `${get('year')}-${get('month')}-${get('day')}`, startTime: `${get('hour')}:${get('minute')}`, endTime: '23:30', placeKey: null, locationText: 'somewhere' }));
    expect(res.body.flags[0]).toMatchObject({ code: 'possible_duplicate', relatedEvent: { id: String(live!._id) } });
  });
});

describe('Ingestion', () => {
  const ingest = (body: object, key: string | null = INGEST_KEY) => {
    const r = request(app).post('/api/ingest/listings');
    return (key ? r.set('X-Api-Key', key) : r).send(body);
  };
  const soon = (days: number, hour = 19) => {
    const d = addDays(campusDay(), days);
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-06:00`;
  };
  const listing = (extra: object = {}) => ({ externalId: 'post-1', title: 'Acoustic covers night', category: 'Music', startsAt: soon(6), location: 'Union courtyard', ...extra });

  it('needs the right key', async () => {
    expect((await ingest({}, null)).status).toBe(401);
    expect((await ingest({}, 'wrong-key-wrong-key-wrong')).status).toBe(401);
    const noKey = createApp({ config: { CORS_ORIGINS: [], ALLOWED_EMAIL_DOMAIN: 'illinois.edu', REQUIRE_VERIFIED_EMAIL: true, DEMO_MODE: false, PUBLIC_WEB_URL: 'x' }, verifyToken: fakeVerifier, rateLimits: false });
    expect((await request(noKey).post('/api/ingest/listings').set('X-Api-Key', INGEST_KEY).send({})).status).toBe(503);
  });

  it('queues listings, matches buildings and clubs, and reports bad ones', async () => {
    const res = await ingest({
      source: { kind: 'instagram', name: 'Acoustic Club', handle: '@AcousticClub' },
      listings: [
        listing({ dateFromImage: true }),
        listing({ externalId: 'post-2', title: 'Coffee and chords', startsAt: soon(7, 10), location: 'Some apartment' }),
        listing({ externalId: 'post-3', startsAt: '2026-12-04T19:00:00' }),
        { externalId: 'post-4', title: 'No category', startsAt: soon(8) }
      ]
    });
    expect(res.status).toBe(200);
    const body = res.body as IngestResponse;
    expect(body.counts).toEqual({ created: 2, updated: 0, unchanged: 0, invalid: 2 });
    expect(body.results[2]!.errors?.startsAt).toBeTruthy();
    expect(body.results[3]!.errors?.category).toBeTruthy();
    expect(body.results[0]!.flags).toEqual(['date_from_image']);
    expect(body.results[1]!.flags).toEqual(['location_missing']);

    const e = await Event.findById(body.results[0]!.eventId).populate('location.place', 'key').lean();
    expect(e).toMatchObject({ status: 'in_review', host: { name: 'Acoustic Club' }, location: { place: { key: 'illini-union' }, detail: 'courtyard', text: 'Union courtyard' }, source: { kind: 'instagram', handle: '@acousticclub', externalId: 'post-1' } });
    expect(e!.host!.organization).toBeTruthy();
    const source = await Source.findOne({ kind: 'instagram', handle: 'acousticclub' }).lean();
    expect(source!.lastRun).toMatchObject({ newListings: 2 });
    expect(await isPublic(String(e!._id))).toBe(false);
  });

  it('updates a queued listing when re-sent, and leaves reviewed ones alone', async () => {
    const src = { kind: 'instagram', name: 'Acoustic Club', handle: 'acousticclub' };
    const again = (await ingest({ source: src, listings: [listing({ title: 'Acoustic covers night (moved)', startsAt: soon(6, 20) })] })).body as IngestResponse;
    expect(again.results[0]!.result).toBe('updated');
    const id = again.results[0]!.eventId!;
    expect((await Event.findById(id).lean())!.title).toBe('Acoustic covers night (moved)');

    await decide(id, 'approve');
    const after = (await ingest({ source: src, listings: [listing({ title: 'Something else' })] })).body as IngestResponse;
    expect(after.results[0]).toMatchObject({ result: 'unchanged', eventId: id });
    expect((await Event.findById(id).lean())!.title).toBe('Acoustic covers night (moved)');
  });

  it('flags listings that repeat a live event', async () => {
    const live = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + DAY) } }).lean();
    const res = (await ingest({
      source: { kind: 'event_board', name: 'Campus events calendar' },
      listings: [{ externalId: 'cal-1', title: live!.title, category: live!.category, startsAt: live!.startsAt.toISOString() }]
    })).body as IngestResponse;
    expect(res.results[0]!.flags).toContain('possible_duplicate');
    const q = await queue();
    expect(q.items.find(i => i.id === res.results[0]!.eventId)!.flags.find(f => f.code === 'possible_duplicate')!.relatedEvent!.id).toBe(String(live!._id));
  });

  it('limits batch size', async () => {
    const listings = Array.from({ length: 201 }, (_, i) => listing({ externalId: `x-${i}` }));
    const res = await ingest({ source: { kind: 'event_board', name: 'Big calendar' }, listings });
    expect(res.status).toBe(400);
    const pub = (await request(app).get('/api/events?q=acoustic&limit=100')).body as Page<EventSummaryDTO>;
    expect(pub.items.length).toBeGreaterThan(0);
  });
});
