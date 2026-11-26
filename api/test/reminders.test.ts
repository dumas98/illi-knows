import type { MongoMemoryServer } from 'mongodb-memory-server';
import type { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Event, Rsvp, User } from '../src/models/index.js';
import { seedDatabase } from '../src/seed/seed.js';
import { MailerError, brevoMailer, resendMailer, type EmailMessage, type Mailer } from '../src/services/mailer.js';
import { reminderEmail, whenPhrase } from '../src/services/reminderEmail.js';
import { MAX_FAILURES, sendDueReminders } from '../src/services/reminders.js';
import { JOBS_KEY, auth, fakeVerifier, startDb, stopDb, testApp } from './setup.js';

let mem: MongoMemoryServer;
const DAY = 86_400_000;
const HOUR = 3_600_000;

function fakeMailer(fail = false): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'fake',
    sent,
    send: async m => {
      if (fail) throw new MailerError('provider down', 503);
      sent.push(m);
    }
  };
}

const opts = (mailer: Mailer, now = new Date()) => ({ mailer, now, webUrl: 'https://illi-knows.web.app', allowedEmailDomain: 'illinois.edu' });

let patId: Types.ObjectId;
let eventId: Types.ObjectId;

/** Gives Pat an RSVP to a published event tomorrow with a reminder that is already due. */
async function dueReminder(extra: Record<string, unknown> = {}, eventFilter: Record<string, unknown> = {}) {
  const e = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + 2 * HOUR) }, ...eventFilter }).sort({ startsAt: 1 }).lean();
  eventId = e!._id;
  await Rsvp.deleteMany({ user: patId, event: e!._id });
  return Rsvp.create({ user: patId, event: e!._id, going: true, reminder: '1h', remindAt: new Date(Date.now() - 60_000), ...extra });
}

beforeAll(async () => {
  mem = await startDb();
  await seedDatabase({ fakeUsers: 30 });
  await request(testApp()).get('/api/me').set(auth('student'));
  patId = (await User.findOne({ email: 'pat.lee@illinois.edu' }))!._id;
});

beforeEach(async () => {
  await Rsvp.updateMany({}, { $unset: { remindAt: 1 } });
});

afterAll(async () => {
  await stopDb(mem);
});

describe('Reminder job', () => {
  it('sends each due reminder once, to the campus address, then clears it', async () => {
    const r = await dueReminder();
    const mailer = fakeMailer();
    const run = await sendDueReminders(opts(mailer));
    expect(run).toMatchObject({ sent: 1, failed: 0, more: false });
    expect(mailer.sent).toHaveLength(1);
    const e = await Event.findById(eventId).lean();
    expect(mailer.sent[0]!.to).toBe('pat.lee@illinois.edu');
    expect(mailer.sent[0]!.subject).toBe(`Reminder: ${e!.title} is ${whenPhrase(e!.startsAt, new Date())}`);
    expect(mailer.sent[0]!.text).toContain(`https://illi-knows.web.app/events/${String(e!._id)}`);

    const after = await Rsvp.findById(r._id).lean();
    expect(after!.remindAt).toBeUndefined();
    expect(after!.reminderSentAt).toBeInstanceOf(Date);
    expect((await sendDueReminders(opts(mailer))).sent).toBe(0);
  });

  it('never double-sends when two runs overlap', async () => {
    await dueReminder();
    const mailer = fakeMailer();
    const runs = await Promise.all([sendDueReminders(opts(mailer)), sendDueReminders(opts(mailer)), sendDueReminders(opts(mailer))]);
    expect(runs.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it('skips seeded fake accounts, people who turned emails off, cancelled RSVPs, and events that started or were pulled', async () => {
    const fake = await User.findOne({ email: /@example\.edu$/ }).lean();
    const e = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + 2 * HOUR) } }).lean();
    await Rsvp.deleteMany({ user: fake!._id, event: e!._id });
    await Rsvp.create({ user: fake!._id, event: e!._id, going: true, reminder: '1h', remindAt: new Date(Date.now() - 60_000) });
    const mailer = fakeMailer();
    expect(await sendDueReminders(opts(mailer))).toMatchObject({ sent: 0, skipped: 1 });

    await User.updateOne({ _id: patId }, { $set: { 'preferences.emailReminders': false } });
    await dueReminder();
    expect(await sendDueReminders(opts(mailer))).toMatchObject({ sent: 0, skipped: 1 });
    await User.updateOne({ _id: patId }, { $set: { 'preferences.emailReminders': true } });

    const cancelled = await dueReminder({ going: false });
    expect((await sendDueReminders(opts(mailer))).sent).toBe(0);
    expect((await Rsvp.findById(cancelled._id).lean())!.remindAt).toBeUndefined();

    await dueReminder({}, {});
    await Event.updateOne({ _id: eventId }, { $set: { status: 'in_review' } });
    expect(await sendDueReminders(opts(mailer))).toMatchObject({ sent: 0, skipped: 1 });
    await Event.updateOne({ _id: eventId }, { $set: { status: 'published' } });

    await dueReminder();
    const started = await sendDueReminders(opts(mailer, new Date(Date.now() + 30 * DAY)));
    expect(started.sent).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('retries a failed send later, then gives up', async () => {
    const r = await dueReminder();
    const down = fakeMailer(true);
    let now = new Date();
    for (let i = 1; i <= MAX_FAILURES; i++) {
      const run = await sendDueReminders(opts(down, now));
      expect(run.failed).toBe(1);
      const doc = await Rsvp.findById(r._id).lean();
      expect(doc!.reminderFailures).toBe(i);
      expect(doc!.reminderSentAt).toBeUndefined();
      if (i < MAX_FAILURES) {
        expect(doc!.remindAt!.getTime()).toBe(now.getTime() + 10 * 60_000);
        expect((await sendDueReminders(opts(down, now))).failed).toBe(0);
        now = new Date(now.getTime() + 11 * 60_000);
      } else expect(doc!.remindAt).toBeUndefined();
    }
  });
});

describe('Reminder endpoint', () => {
  it('needs the jobs key and reports what it did', async () => {
    const mailer = fakeMailer();
    const app = testApp({ mailer });
    expect((await request(app).post('/api/jobs/reminders')).status).toBe(401);
    await dueReminder();
    const res = await request(app).post('/api/jobs/reminders').set('X-Jobs-Key', JOBS_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mailer: 'fake', sent: 1, failed: 0 });
    expect(mailer.sent).toHaveLength(1);

    const unset = createApp({ config: { CORS_ORIGINS: [], ALLOWED_EMAIL_DOMAIN: 'illinois.edu', REQUIRE_VERIFIED_EMAIL: true, DEMO_MODE: false, PUBLIC_WEB_URL: 'x' }, verifyToken: fakeVerifier });
    expect((await request(unset).post('/api/jobs/reminders').set('X-Jobs-Key', JOBS_KEY)).status).toBe(503);
  });

  it('sets reminders from an RSVP so the job picks them up at the right time', async () => {
    const e = await Event.findOne({ status: 'published', startsAt: { $gt: new Date(Date.now() + 3 * DAY) } }).lean();
    await request(testApp()).put(`/api/events/${String(e!._id)}/rsvp`).set(auth('student')).send({ going: true, reminder: '1d' });
    const r = await Rsvp.findOne({ user: patId, event: e!._id }).lean();
    expect(r!.remindAt!.getTime()).toBe(e!.startsAt.getTime() - DAY);
    const mailer = fakeMailer();
    expect((await sendDueReminders(opts(mailer))).sent).toBe(0);
    expect((await sendDueReminders(opts(mailer, new Date(e!.startsAt.getTime() - DAY + 1000)))).sent).toBe(1);
  });
});

describe('Reminder email', () => {
  const event = { id: 'abc', title: 'Jazz <combo> & friends', startsAt: new Date('2026-12-04T01:00:00Z'), endsAt: new Date('2026-12-04T03:00:00Z'), locationText: 'Smith Memorial Hall', hostName: 'Jazz Club' };

  it('says when in campus time', () => {
    expect(whenPhrase(event.startsAt, new Date('2026-12-03T15:00:00Z'))).toBe('today at 7:00 pm');
    expect(whenPhrase(event.startsAt, new Date('2026-12-02T15:00:00Z'))).toBe('tomorrow at 7:00 pm');
    expect(whenPhrase(event.startsAt, new Date('2026-11-29T15:00:00Z'))).toBe('Thursday, December 3 at 7:00 pm');
  });

  it('escapes event text in the HTML and has a plain-text version', () => {
    const m = reminderEmail({ to: 'pat@illinois.edu', name: 'Pat Lee', event, webUrl: 'https://illi-knows.web.app/', now: new Date('2026-12-03T15:00:00Z') });
    expect(m.subject).toBe('Reminder: Jazz <combo> & friends is today at 7:00 pm');
    expect(m.html).toContain('Jazz &lt;combo&gt; &amp; friends');
    expect(m.html).not.toContain('<combo>');
    expect(m.html).toContain('href="https://illi-knows.web.app/events/abc"');
    expect(m.text).toContain('Hi Pat,');
    expect(m.text).toContain('When: Thursday, December 3, 7:00 pm to 9:00 pm');
  });
});

describe('Email providers', () => {
  const msg: EmailMessage = { to: 'pat@illinois.edu', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };
  const from = { email: 'sender@gmail.com', name: 'Illi-Knows' };
  afterEach(() => vi.unstubAllGlobals());

  it('calls Brevo and Resend the way their APIs expect', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await brevoMailer('brevo-key', from).send(msg);
    await resendMailer('resend-key', from).send(msg);
    const [brevoUrl, brevoInit] = fetchMock.mock.calls[0]!;
    expect(brevoUrl).toBe('https://api.brevo.com/v3/smtp/email');
    expect((brevoInit!.headers as Record<string, string>)['api-key']).toBe('brevo-key');
    expect(JSON.parse(String(brevoInit!.body))).toEqual({ sender: from, to: [{ email: msg.to }], subject: 'Hi', htmlContent: '<p>Hi</p>', textContent: 'Hi' });
    const [resendUrl, resendInit] = fetchMock.mock.calls[1]!;
    expect(resendUrl).toBe('https://api.resend.com/emails');
    expect((resendInit!.headers as Record<string, string>).Authorization).toBe('Bearer resend-key');
    expect(JSON.parse(String(resendInit!.body))).toMatchObject({ from: 'Illi-Knows <sender@gmail.com>', to: [msg.to] });
  });

  it('reports provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"unauthorized"}', { status: 401 })));
    await expect(brevoMailer('bad', from).send(msg)).rejects.toMatchObject({ status: 401, message: expect.stringContaining('Brevo answered 401') });
  });

  it('refuses to start with a provider but no key', () => {
    const base = { MONGODB_URI: 'mongodb://x/y', FIREBASE_PROJECT_ID: 'p' };
    expect(() => loadConfig({ ...base, EMAIL_PROVIDER: 'brevo' })).toThrow(/needs EMAIL_API_KEY and EMAIL_FROM/);
    expect(loadConfig({ ...base, EMAIL_PROVIDER: 'brevo', EMAIL_API_KEY: 'k', EMAIL_FROM: 'a@b.co' }).EMAIL_PROVIDER).toBe('brevo');
    expect(loadConfig(base).EMAIL_PROVIDER).toBe('console');
  });
});
