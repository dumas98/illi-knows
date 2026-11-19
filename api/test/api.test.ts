import type { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AttendeesDTO, EventDetailDTO, EventSummaryDTO, MeDTO, Page, PlaceDTO } from '@illi-knows/shared';
import { Event, Rsvp, User } from '../src/models/index.js';
import { seedDatabase, type SeedResult } from '../src/seed/seed.js';
import { auth, startDb, stopDb, testApp } from './setup.js';

let mem: MongoMemoryServer;
let seeded: SeedResult;
const app = testApp();

beforeAll(async () => {
  mem = await startDb();
  seeded = await seedDatabase({ fakeUsers: 60 });
});

afterAll(async () => {
  await stopDb(mem);
});

describe('seed', () => {
  it('builds a usable semester', async () => {
    expect(seeded.places).toBe(13);
    expect(seeded.reviewQueue).toBeGreaterThanOrEqual(6);
    expect(seeded.thisWeek).toBeGreaterThan(3);
    expect(seeded.rsvps).toBeGreaterThan(100);
  });

  it('keeps event totals in line with RSVPs', async () => {
    const e = await Event.findOne({ status: 'published', 'stats.goingCount': { $gt: 0 } }).lean();
    const going = await Rsvp.countDocuments({ event: e!._id, going: true });
    expect(e!.stats!.goingCount).toBe(going);
  });
});

describe('GET /api/health', () => {
  it('reports the database is up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: 'up' });
  });
});

describe('GET /api/events', () => {
  it('lists only upcoming published events, soonest first', async () => {
    const res = await request(app).get('/api/events?limit=100');
    expect(res.status).toBe(200);
    const items = (res.body as Page<EventSummaryDTO>).items;
    expect(items.length).toBeGreaterThan(5);
    const starts = items.map(e => Date.parse(e.startsAt));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(items.every(e => Date.parse(e.endsAt) >= Date.now() - 60_000)).toBe(true);
    const ids = items.map(e => e.id);
    const statuses = await Event.find({ _id: { $in: ids } }).distinct('status');
    expect(statuses).toEqual(['published']);
  });

  it('pages with a cursor without repeating events', async () => {
    const first = (await request(app).get('/api/events?limit=4')).body as Page<EventSummaryDTO>;
    expect(first.nextCursor).toBeTruthy();
    const second = (await request(app).get(`/api/events?limit=4&cursor=${first.nextCursor}`)).body as Page<EventSummaryDTO>;
    const overlap = second.items.filter(e => first.items.some(f => f.id === e.id));
    expect(overlap).toHaveLength(0);
    expect(Date.parse(second.items[0]!.startsAt)).toBeGreaterThanOrEqual(Date.parse(first.items.at(-1)!.startsAt));
  });

  it('filters by category, price, source, place, and text', async () => {
    const food = (await request(app).get('/api/events?category=Food&limit=100')).body as Page<EventSummaryDTO>;
    expect(food.items.length).toBeGreaterThan(0);
    expect(food.items.every(e => e.category === 'Food')).toBe(true);

    const free = (await request(app).get('/api/events?free=true&limit=100')).body as Page<EventSummaryDTO>;
    expect(free.items.every(e => e.price.isFree)).toBe(true);

    const ig = (await request(app).get('/api/events?source=instagram&limit=100')).body as Page<EventSummaryDTO>;
    expect(ig.items.every(e => e.source.kind === 'instagram')).toBe(true);

    const quad = (await request(app).get('/api/events?place=quad&limit=100')).body as Page<EventSummaryDTO>;
    expect(quad.items.length).toBeGreaterThan(0);
    expect(quad.items.every(e => e.place?.key === 'quad')).toBe(true);

    const nowhere = (await request(app).get('/api/events?place=moon')).body as Page<EventSummaryDTO>;
    expect(nowhere.items).toEqual([]);

    const search = (await request(app).get('/api/events?q=pancake')).body as Page<EventSummaryDTO>;
    expect(search.items.some(e => e.title.includes('pancake'))).toBe(true);
  });

  it('rejects bad filters with a 400', async () => {
    const res = await request(app).get('/api/events?category=Gaming');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it("includes the viewer's own RSVP when signed in", async () => {
    const list = (await request(app).get('/api/events?limit=1')).body as Page<EventSummaryDTO>;
    const target = list.items[0]!;
    await request(app).get('/api/me').set(auth('student'));
    const me = await User.findOne({ email: 'pat.lee@illinois.edu' });
    await Rsvp.create({ user: me!._id, event: target.id, anonymous: true });
    const signedIn = (await request(app).get('/api/events?limit=1').set(auth('student'))).body as Page<EventSummaryDTO>;
    expect(signedIn.items[0]!.viewer).toMatchObject({ going: true, anonymous: true });
    expect(list.items[0]!.viewer).toBeNull();
  });
});

describe('GET /api/events/:id', () => {
  it('returns a published event and counts the view', async () => {
    const e = await Event.findOne({ status: 'published' }).lean();
    const before = e!.stats!.viewCount;
    const res = await request(app).get(`/api/events/${e!._id}`);
    expect(res.status).toBe(200);
    expect((res.body as EventDetailDTO).title).toBe(e!.title);
    const after = await Event.findById(e!._id).lean();
    expect(after!.stats!.viewCount).toBe(before + 1);
  });

  it('hides events in review from guests but shows them to admins', async () => {
    const e = await Event.findOne({ status: 'in_review' }).lean();
    expect((await request(app).get(`/api/events/${e!._id}`)).status).toBe(404);
    await request(app).get('/api/me').set(auth('admin'));
    await User.updateOne({ email: 'sam.admin@illinois.edu' }, { $addToSet: { roles: 'admin' } });
    expect((await request(app).get(`/api/events/${e!._id}`).set(auth('admin'))).status).toBe(200);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    expect((await request(app).get('/api/events/not-an-id')).status).toBe(400);
    expect((await request(app).get('/api/events/0123456789abcdef01234567')).status).toBe(404);
  });
});

describe('GET /api/events/:id/attendees', () => {
  it('never lists anonymous RSVPs', async () => {
    const anon = await Rsvp.findOne({ anonymous: true, going: true }).lean();
    const res = await request(app).get(`/api/events/${anon!.event}/attendees?limit=50`);
    expect(res.status).toBe(200);
    const body = res.body as AttendeesDTO;
    const hidden = await Rsvp.find({ event: anon!.event, anonymous: true }).distinct('user');
    expect(body.shown.some(a => hidden.some(h => String(h) === a.id))).toBe(false);
    const event = await Event.findById(anon!.event).lean();
    expect(body.total).toBe(event!.stats!.goingCount);
  });
});

describe('GET /api/places', () => {
  it('lists every map place', async () => {
    const res = await request(app).get('/api/places');
    expect(res.status).toBe(200);
    expect((res.body as PlaceDTO[]).map(p => p.key)).toContain('union');
  });
});

describe('/api/me', () => {
  it('requires sign-in', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth_required');
  });

  it('creates the account on first sign-in and reuses it after', async () => {
    const first = (await request(app).get('/api/me').set(auth('student'))).body as MeDTO;
    const second = (await request(app).get('/api/me').set(auth('student'))).body as MeDTO;
    expect(first.email).toBe('pat.lee@illinois.edu');
    expect(first.roles).toEqual(['student']);
    expect(second.id).toBe(first.id);
  });

  it('links a pre-made account by email', async () => {
    await User.deleteOne({ email: 'pat.lee@illinois.edu' });
    const premade = await User.create({ name: 'Pat Lee', email: 'pat.lee@illinois.edu', roles: ['student', 'organizer'] });
    const me = (await request(app).get('/api/me').set(auth('student'))).body as MeDTO;
    expect(me.id).toBe(String(premade._id));
    expect(me.roles).toContain('organizer');
  });

  it('rejects emails outside illinois.edu, unverified emails, and bad tokens', async () => {
    const outsider = await request(app).get('/api/me').set(auth('outsider'));
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.code).toBe('email_domain');
    const unverified = await request(app).get('/api/me').set(auth('unverified'));
    expect(unverified.body.error.code).toBe('email_unverified');
    const bad = await request(app).get('/api/me').set({ Authorization: 'Bearer nope' });
    expect(bad.status).toBe(401);
  });

  it('updates preferences and rejects unknown values', async () => {
    const ok = await request(app).patch('/api/me/preferences').set(auth('student')).send({ defaultReminder: '1d', rsvpAnonymously: true });
    expect(ok.status).toBe(200);
    expect((ok.body as MeDTO).preferences).toMatchObject({ defaultReminder: '1d', rsvpAnonymously: true });
    const bad = await request(app).patch('/api/me/preferences').set(auth('student')).send({ defaultReminder: '2h' });
    expect(bad.status).toBe(400);
  });
});
