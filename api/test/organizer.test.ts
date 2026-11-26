import type { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EventInput, InsightsDTO, MeDTO, OrganizerEventDTO, Page, EventSummaryDTO } from '@illi-knows/shared';
import { addDays, campusDay, campusTime } from '../src/lib/time.js';
import { Event, Organization, Rsvp, User } from '../src/models/index.js';
import { seedDatabase } from '../src/seed/seed.js';
import { auth, startDb, stopDb, testApp } from './setup.js';

let mem: MongoMemoryServer;
const app = testApp();
const DAY = 86_400_000;

const dayString = (offset: number) => {
  const d = addDays(campusDay(), offset);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
};

const input = (extra: Partial<EventInput> = {}): EventInput => ({
  title: 'Vinyl listening party',
  description: 'Bring a record, we play a side each.',
  category: 'Music',
  date: dayString(5),
  startTime: '19:00',
  endTime: '21:30',
  placeKey: 'illini-union',
  locationDetail: 'Room 210',
  locationText: '',
  organizationId: null,
  isFree: true,
  priceDollars: null,
  priceNote: '',
  submit: false,
  ...extra
});

const post = (body: object, who: 'organizer' | 'student' = 'organizer') => request(app).post('/api/organizer/events').set(auth(who)).send(body);

beforeAll(async () => {
  mem = await startDb();
  await seedDatabase({ fakeUsers: 40 });
  await request(app).get('/api/me').set(auth('organizer'));
  await request(app).get('/api/me').set(auth('admin'));
});

afterAll(async () => {
  await stopDb(mem);
});

describe('Posting events', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/organizer/events')).status).toBe(401);
    expect((await request(app).post('/api/organizer/events').send(input())).status).toBe(401);
  });

  it('saves a draft in campus time, makes you an organizer, and keeps it private', async () => {
    const res = await post(input());
    expect(res.status).toBe(201);
    const e = res.body as OrganizerEventDTO;
    expect(e).toMatchObject({ status: 'draft', title: 'Vinyl listening party', locationText: 'Illini Union, Room 210', editable: true });
    expect(e.host.name).toBe('Tess Ng');
    expect(e.startsAt).toBe(campusTime(addDays(campusDay(), 5), 19, 0).toISOString());
    expect(Date.parse(e.endsAt) - Date.parse(e.startsAt)).toBe(150 * 60_000);

    const me = (await request(app).get('/api/me').set(auth('organizer'))).body as MeDTO;
    expect(me.roles).toContain('organizer');
    const mine = (await request(app).get('/api/organizer/events').set(auth('organizer'))).body as OrganizerEventDTO[];
    expect(mine.map(x => x.id)).toContain(e.id);

    const publicList = (await request(app).get('/api/events?limit=100&q=vinyl')).body as Page<EventSummaryDTO>;
    expect(publicList.items.map(x => x.id)).not.toContain(e.id);
    expect((await request(app).get(`/api/events/${e.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/events/${e.id}`).set(auth('organizer'))).status).toBe(200);
    expect((await request(app).get(`/api/organizer/events/${e.id}`).set(auth('admin'))).status).toBe(404);
  });

  it('explains what is wrong with the form', async () => {
    const empty = await post(input({ title: ' ' }));
    expect(empty.status).toBe(400);
    expect(empty.body.error.details.title).toEqual(['Enter an event name.']);
    expect((await post(input({ endTime: '19:00' }))).body.error.details.endTime).toBeTruthy();
    expect((await post(input({ date: dayString(-2), submit: true }))).body.error.details.date).toEqual(['Pick a date and time in the future.']);
    expect((await post(input({ placeKey: 'the-moon' }))).body.error.details.placeKey).toBeTruthy();
    expect((await post(input({ isFree: false, priceDollars: null }))).body.error.details.priceDollars).toBeTruthy();
  });

  it('handles events that run past midnight and places off the map', async () => {
    const res = await post(input({ startTime: '22:00', endTime: '01:30', placeKey: null, locationText: 'Green Street co-op basement' }));
    const e = res.body as OrganizerEventDTO;
    expect(Date.parse(e.endsAt) - Date.parse(e.startsAt)).toBe(210 * 60_000);
    expect(e.place).toBeNull();
    expect(e.locationText).toBe('Green Street co-op basement');
  });

  it('sends events for review under an organization you belong to', async () => {
    const tess = await User.findOne({ email: 'tess.ng@illinois.edu' });
    const radio = await Organization.findOneAndUpdate({ slug: 'campus-radio' }, { $push: { members: { user: tess!._id, role: 'editor' } } }, { returnDocument: 'after' });
    const res = await post(input({ title: 'Radio open house', organizationId: String(radio!._id), submit: true, isFree: false, priceDollars: 4.5 }));
    expect(res.status).toBe(201);
    const e = res.body as OrganizerEventDTO;
    expect(e).toMatchObject({ status: 'in_review', host: { name: 'Campus Radio' }, price: { isFree: false, amountCents: 450 } });
    expect(e.submittedAt).not.toBeNull();

    const film = await Organization.findOne({ slug: 'film-society' });
    expect((await post(input({ organizationId: String(film!._id) }))).status).toBe(403);
  });
});

describe('Editing events', () => {
  it('sends an edited published event back to review and moves its reminders', async () => {
    const live = await Event.findOne({ 'host.name': 'Campus Radio', status: 'published', startsAt: { $gt: new Date(Date.now() + 2 * DAY) } }).lean();
    const id = String(live!._id);
    const rsvp = await Rsvp.findOneAndUpdate({ event: live!._id, going: true }, { $set: { reminder: '1d' } }, { returnDocument: 'after' });
    expect(rsvp).not.toBeNull();

    const current = (await request(app).get(`/api/organizer/events/${id}`).set(auth('organizer'))).body as OrganizerEventDTO;
    expect(current.status).toBe('published');
    const res = await request(app)
      .put(`/api/organizer/events/${id}`)
      .set(auth('organizer'))
      .send(input({ title: current.title, organizationId: current.host.organizationId, date: dayString(9), startTime: '18:00', endTime: '20:00', submit: false }));
    expect(res.status).toBe(200);
    const e = res.body as OrganizerEventDTO;
    expect(e.status).toBe('in_review');
    expect(e.host.name).toBe('Campus Radio');
    const moved = await Rsvp.findById(rsvp!._id).lean();
    expect(moved!.remindAt!.toISOString()).toBe(new Date(Date.parse(e.startsAt) - DAY).toISOString());
  });

  it('keeps access when you switch an organization’s event to host it yourself', async () => {
    const queued = await Event.findOne({ 'host.name': 'Campus Radio', status: 'draft' }).lean();
    const res = await request(app).put(`/api/organizer/events/${String(queued!._id)}`).set(auth('organizer')).send(input({ title: 'Songwriting workshop' }));
    expect(res.status).toBe(200);
    expect(res.body.host).toEqual({ name: 'Tess Ng', organizationId: null });
  });

  it('keeps a draft a draft until you send it', async () => {
    const draft = (await post(input({ title: 'Zine swap' }))).body as OrganizerEventDTO;
    const saved = await request(app).put(`/api/organizer/events/${draft.id}`).set(auth('organizer')).send(input({ title: 'Zine swap night' }));
    expect(saved.body).toMatchObject({ status: 'draft', title: 'Zine swap night' });
    const sent = await request(app).put(`/api/organizer/events/${draft.id}`).set(auth('organizer')).send(input({ title: 'Zine swap night', submit: true }));
    expect(sent.body.status).toBe('in_review');
  });

  it('refuses to edit ended events and other people’s events', async () => {
    const ended = await Event.findOne({ 'host.name': 'Campus Radio', endsAt: { $lt: new Date() } }).lean();
    const res = await request(app).put(`/api/organizer/events/${String(ended!._id)}`).set(auth('organizer')).send(input());
    expect(res.status).toBe(409);
    const draft = (await post(input({ title: 'Private draft' }))).body as OrganizerEventDTO;
    expect((await request(app).put(`/api/organizer/events/${draft.id}`).set(auth('student')).send(input())).status).toBe(404);
  });

  it('deletes an event and its RSVPs', async () => {
    const live = await Event.findOne({ 'host.name': 'Campus Radio', status: 'published', 'stats.goingCount': { $gt: 0 } }).lean();
    const id = String(live!._id);
    expect((await request(app).delete(`/api/organizer/events/${id}`).set(auth('student'))).status).toBe(404);
    expect((await request(app).delete(`/api/organizer/events/${id}`).set(auth('organizer'))).status).toBe(204);
    expect(await Event.exists({ _id: live!._id })).toBeNull();
    expect(await Rsvp.countDocuments({ event: live!._id })).toBe(0);
  });
});

describe('Insights', () => {
  it('counts RSVPs by day before the event and by how people found it', async () => {
    const e = await Event.findOne({ 'host.name': 'Campus Radio', status: 'published', 'stats.goingCount': { $gt: 10 } }).lean();
    const res = await request(app).get(`/api/organizer/events/${String(e!._id)}/insights`).set(auth('organizer'));
    expect(res.status).toBe(200);
    const body = res.body as InsightsDTO;
    const going = await Rsvp.countDocuments({ event: e!._id, going: true });
    expect(body.rsvpsByDay).toHaveLength(14);
    expect(body.rsvpsByDay[0]!.daysBefore).toBe(13);
    expect(body.rsvpsByDay.at(-1)!.daysBefore).toBe(0);
    expect(body.rsvpsByDay.reduce((n, d) => n + d.count, 0) + body.earlier).toBe(going);
    expect(body.foundVia.reduce((n, d) => n + d.value, 0)).toBe(going);
    expect(body.past.length).toBeGreaterThan(0);
    const starts = body.past.map(p => Date.parse(p.startsAt));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect((await request(app).get(`/api/organizer/events/${String(e!._id)}/insights`).set(auth('admin'))).status).toBe(404);
  });
});
