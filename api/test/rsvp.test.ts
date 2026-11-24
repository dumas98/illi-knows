import type { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AttendeesDTO, EventDetailDTO, MeDTO, PlannerDTO } from '@illi-knows/shared';
import { Event, Rsvp, User } from '../src/models/index.js';
import { seedDatabase } from '../src/seed/seed.js';
import { auth, startDb, stopDb, testApp } from './setup.js';

let mem: MongoMemoryServer;
let eventId: string;
let me: MeDTO;
const app = testApp();

beforeAll(async () => {
  mem = await startDb();
  await seedDatabase({ fakeUsers: 40 });
  const e = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + 3 * 86_400_000) } }).sort({ startsAt: 1 }).lean();
  eventId = String(e!._id);
  me = (await request(app).get('/api/me').set(auth('student'))).body as MeDTO;
});

afterAll(async () => {
  await stopDb(mem);
});

const rsvp = (body: object) => request(app).put(`/api/events/${eventId}/rsvp`).set(auth('student')).send(body);
const going = async () => (await Event.findById(eventId).lean())!.stats!;

describe('RSVP', () => {
  it('requires sign-in', async () => {
    const res = await request(app).put(`/api/events/${eventId}/rsvp`).send({ going: true });
    expect(res.status).toBe(401);
  });

  it('RSVPs anonymously, counts it, and keeps the name off the attendee list', async () => {
    const before = await going();
    const res = await rsvp({ going: true, anonymous: true, foundVia: 'map' });
    expect(res.status).toBe(200);
    const body = res.body as EventDetailDTO;
    expect(body.viewer).toMatchObject({ going: true, anonymous: true });
    expect(body.goingCount).toBe(before.goingCount + 1);
    const after = await going();
    expect(after.anonymousCount).toBe(before.anonymousCount + 1);
    const attendees = (await request(app).get(`/api/events/${eventId}/attendees?limit=50`)).body as AttendeesDTO;
    expect(attendees.shown.some(a => a.id === me.id)).toBe(false);
  });

  it('shows the name once the RSVP is no longer anonymous', async () => {
    await rsvp({ anonymous: false });
    const attendees = (await request(app).get(`/api/events/${eventId}/attendees?limit=50`)).body as AttendeesDTO;
    expect(attendees.shown.some(a => a.id === me.id && a.name === 'Pat Lee')).toBe(true);
    expect((await going()).anonymousCount).toBe((await Rsvp.countDocuments({ event: eventId, going: true, anonymous: true })));
  });

  it('schedules and clears reminders', async () => {
    const e = await Event.findById(eventId).lean();
    await rsvp({ reminder: '1d' });
    let r = await Rsvp.findOne({ event: eventId, user: me.id }).lean();
    expect(r!.remindAt!.getTime()).toBe(e!.startsAt.getTime() - 86_400_000);
    await rsvp({ reminder: 'none' });
    r = await Rsvp.findOne({ event: eventId, user: me.id }).lean();
    expect(r!.remindAt).toBeUndefined();
  });

  it('cancels and updates the count', async () => {
    const before = await going();
    const res = await request(app).delete(`/api/events/${eventId}/rsvp`).set(auth('student'));
    expect(res.status).toBe(200);
    expect((res.body as EventDetailDTO).viewer?.going).toBe(false);
    expect((await going()).goingCount).toBe(before.goingCount - 1);
    const r = await Rsvp.findOne({ event: eventId, user: me.id }).lean();
    expect(r!.cancelledAt).toBeInstanceOf(Date);
  });

  it('refuses events that ended or are not published, and unknown fields', async () => {
    const past = await Event.findOne({ status: 'published', endsAt: { $lt: new Date() } }).lean();
    const ended = await request(app).put(`/api/events/${past!._id}/rsvp`).set(auth('student')).send({ going: true });
    expect(ended.status).toBe(409);
    expect(ended.body.error.code).toBe('event_ended');
    const draft = await Event.findOne({ status: 'in_review' }).lean();
    expect((await request(app).put(`/api/events/${draft!._id}/rsvp`).set(auth('student')).send({ going: true })).status).toBe(404);
    expect((await rsvp({ going: true, plusOne: true })).status).toBe(400);
  });

  it('uses the account defaults for a new RSVP', async () => {
    await User.updateOne({ email: 'pat.lee@illinois.edu' }, { $set: { 'preferences.rsvpAnonymously': true, 'preferences.defaultReminder': '1h' } });
    const other = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + 86_400_000) }, _id: { $ne: eventId } }).lean();
    const res = await request(app).put(`/api/events/${other!._id}/rsvp`).set(auth('student')).send({ going: true });
    expect((res.body as EventDetailDTO).viewer).toMatchObject({ going: true, anonymous: true, reminder: '1h' });
  });
});

describe('GET /api/events/:id/ics', () => {
  it('returns a calendar file anyone can download', async () => {
    const res = await request(app).get(`/api/events/${eventId}/ics`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('.ics');
    expect(res.text).toContain('BEGIN:VEVENT');
    expect(res.text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(res.text).toContain(`illi-knows.web.app/events/${eventId}`);
  });
});

describe('GET /api/me/planner', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/me/planner')).status).toBe(401);
  });

  it('lists upcoming RSVPs in order and suggests other events', async () => {
    await rsvp({ going: true, reminder: '1d', inCalendar: true });
    const res = await request(app).get('/api/me/planner').set(auth('student'));
    expect(res.status).toBe(200);
    const p = res.body as PlannerDTO;
    expect(p.semester).toMatch(/^(Fall|Spring|Summer) \d{4}$/);
    expect(p.upcoming.some(e => e.id === eventId && e.viewer?.going)).toBe(true);
    const starts = p.upcoming.map(e => Date.parse(e.startsAt));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(p.stats.upcoming).toBe(p.upcoming.length);
    expect(p.stats.remindersSet).toBeGreaterThanOrEqual(1);
    expect(p.stats.inCalendar).toBeGreaterThanOrEqual(1);
    expect(p.suggestions.length).toBeGreaterThan(0);
    expect(p.suggestions.some(s => p.upcoming.some(u => u.id === s.id))).toBe(false);
    expect(p.attendedByMonth.length).toBeGreaterThan(0);
  });
});
