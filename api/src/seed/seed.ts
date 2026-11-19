import { Faker, en } from '@faker-js/faker';
import { Types } from 'mongoose';
import { REMINDER_MINUTES, type FoundVia, type Reminder } from '@illi-knows/shared';
import { addDays, campusDay, campusTime, weekday } from '../lib/time.js';
import { ALL_MODELS, Event, Organization, Place, Rsvp, Source, User } from '../models/index.js';
import { FAKE_EMAIL_DOMAIN, ORGS, PLACES, REVIEW_QUEUE, TEMPLATES, type EventTemplate } from './data.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface SeedOptions {
  now?: Date;
  seed?: number;
  fakeUsers?: number;
}

export interface SeedResult {
  places: number;
  organizations: number;
  users: number;
  sources: number;
  events: number;
  published: number;
  reviewQueue: number;
  rsvps: number;
  thisWeek: number;
}

type Doc = Record<string, unknown> & { _id: Types.ObjectId };

const ANCHORS: [string, number][] = [
  ['dumplings', 0], ['volleyball', 0], ['resume-review', 1], ['open-mic', 2], ['farmers-market', 3],
  ['pottery', 3], ['jazz', 4], ['printmaking', 5], ['startup-fair', 6], ['pancakes', 7],
  ['climbing', 8], ['film-showcase', 9], ['fun-run', 11]
];

const CAMPUS_RADIO: (Omit<EventTemplate, 'key' | 'org' | 'source' | 'popularity'> & {
  offset: number;
  status: 'published' | 'in_review' | 'draft' | 'changes_requested';
  popularity?: [number, number];
  note?: string;
})[] = [
  { title: 'Battle of the bands', category: 'Music', place: 'union', detail: 'Ballroom', hour: 19, minute: 30, minutes: 180, priceCents: 800, offset: 10, status: 'published', popularity: [120, 150], description: 'Six student bands, twenty minutes each, and the crowd picks the winner. Doors open at 7:00 pm.' },
  { title: 'Vinyl swap meet', category: 'Music', place: 'union', detail: 'Lobby', hour: 12, minutes: 180, offset: 10, status: 'in_review', description: 'Bring records to trade or sell. Tables are free; first come, first served.' },
  { title: 'Songwriting workshop', category: 'Music', place: 'music', detail: 'Room 12', hour: 17, minutes: 90, offset: 15, status: 'draft', description: 'Write a verse and chorus in ninety minutes with two student songwriters.' },
  { title: 'Karaoke night', category: 'Music', place: null, hour: 20, minutes: 150, offset: 17, status: 'changes_requested', note: 'Add a location', description: 'Campus Radio hosts its end-of-semester karaoke night.' },
  { title: 'Fall showcase', category: 'Music', place: 'theater', hour: 19, minutes: 150, offset: -25, status: 'published', popularity: [120, 140], description: 'Every Campus Radio show performs one live segment.' },
  { title: 'Trivia night', category: 'Music', place: 'library', hour: 20, minutes: 120, offset: -40, status: 'published', popularity: [60, 80], description: 'Music trivia in five rounds. Teams of up to four.' },
  { title: 'Welcome concert', category: 'Music', place: 'quad', hour: 18, minutes: 180, offset: -55, status: 'published', popularity: [140, 150], description: 'Three bands kick off the semester on the main quad.' }
];

function locationText(placeName: string | undefined, detail: string | undefined): string {
  if (!placeName) return '';
  return detail ? `${placeName}, ${detail.toLowerCase()}` : placeName;
}

export async function seedDatabase(opts: SeedOptions = {}): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  const f = new Faker({ locale: [en] });
  f.seed(opts.seed ?? 409);
  const today = campusDay(now);
  const at = (offset: number, hour: number, minute = 0) => campusTime(addDays(today, offset), hour, minute);

  for (const model of ALL_MODELS) await model.collection.deleteMany({});
  for (const model of ALL_MODELS) await model.syncIndexes();

  const places = await Place.insertMany(PLACES);
  const placeByKey = new Map(places.map(p => [p.key, p]));

  const personas = [
    { name: 'Denise Ruiz', email: `denise.ruiz@${FAKE_EMAIL_DOMAIN}`, roles: ['student'] },
    { name: 'Tim Okafor', email: `tim.okafor@${FAKE_EMAIL_DOMAIN}`, roles: ['student', 'organizer'] },
    { name: 'Alex Moreno', email: `alex.moreno@${FAKE_EMAIL_DOMAIN}`, roles: ['student', 'admin'] }
  ];
  const emails = new Set(personas.map(p => p.email));
  const people: { name: string; email: string; roles: string[] }[] = [...personas];
  while (people.length < personas.length + (opts.fakeUsers ?? 150)) {
    const first = f.person.firstName();
    const last = f.person.lastName();
    let email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${FAKE_EMAIL_DOMAIN}`;
    for (let i = 2; emails.has(email); i++) email = email.replace(/\d*@/, `${i}@`);
    emails.add(email);
    people.push({ name: `${first} ${last}`, email, roles: ['student'] });
  }
  const users = await User.insertMany(people);
  const [denise, tim, alex] = users as [(typeof users)[number], (typeof users)[number], (typeof users)[number]];
  const crowd = users.slice(3);

  const orgs = await Organization.insertMany(
    ORGS.map(o => ({
      name: o.name,
      slug: o.slug,
      kind: o.kind,
      instagramHandle: o.instagram,
      verified: true,
      members:
        o.slug === 'campus-radio'
          ? [{ user: tim._id, role: 'owner' }]
          : o.slug === 'acoustic-club'
            ? [{ user: f.helpers.arrayElement(crowd)._id, role: 'owner' }, { user: tim._id, role: 'editor' }]
            : [{ user: f.helpers.arrayElement(crowd)._id, role: 'owner' }]
    }))
  );
  const orgBySlug = new Map(orgs.map(o => [o.slug, o]));

  const sources = await Source.insertMany([
    { kind: 'event_board', name: 'Campus events calendar', url: 'https://calendar.example.edu', mode: 'automatic', syncEveryMinutes: 30, lastRun: { at: new Date(now.getTime() - 12 * MINUTE), newListings: 2 } },
    { kind: 'event_board', name: 'Department calendars', url: 'https://departments.example.edu/events', mode: 'automatic', syncEveryMinutes: 60, lastRun: { at: new Date(now.getTime() - 41 * MINUTE), newListings: 0 } },
    ...ORGS.filter(o => o.instagram).map(o => ({
      kind: 'instagram', name: `@${o.instagram}`, handle: `@${o.instagram}`, organization: orgBySlug.get(o.slug)?._id, mode: 'manual',
      lastRun: { at: new Date(at(-1, 16, 10).getTime()), newListings: o.slug === 'acoustic-club' ? 1 : 0 }
    })),
    { kind: 'instagram', name: '@campus_life', handle: '@campus_life', mode: 'manual', lastRun: { at: at(-1, 16, 10), newListings: 1 } },
    { kind: 'word_of_mouth', name: 'Flyers and tips', mode: 'manual', lastRun: { at: new Date(now.getTime() - 3 * HOUR), newListings: 1 } }
  ]);
  const feedFor = (kind: string, handle?: string) =>
    sources.find(s => s.kind === kind && (!handle || s.handle === handle))?._id ?? sources.find(s => s.kind === kind)?._id;

  const events: Doc[] = [];
  const popularity = new Map<string, [number, number]>();
  const firstByTemplate = new Map<string, Doc>();
  const usedOn = new Map<string, number[]>();

  const publishedAtFor = (start: Date) => {
    const ideal = start.getTime() - f.number.int({ min: 5, max: 20 }) * DAY;
    return new Date(Math.min(ideal, now.getTime() - f.number.int({ min: 2, max: 48 }) * HOUR));
  };

  const addTemplate = (t: EventTemplate, offset: number) => {
    const org = orgBySlug.get(t.org);
    const place = t.place ? placeByKey.get(t.place) : undefined;
    const startsAt = at(offset, t.hour, t.minute ?? 0);
    const publishedAt = publishedAtFor(startsAt);
    const handle = t.source === 'instagram' && org?.instagramHandle ? `@${org.instagramHandle}` : undefined;
    const doc: Doc = {
      _id: new Types.ObjectId(),
      title: t.title,
      description: t.description,
      category: t.category,
      startsAt,
      endsAt: new Date(startsAt.getTime() + t.minutes * MINUTE),
      location: { place: place?._id, detail: t.detail, text: locationText(place?.name, t.detail) },
      host: { organization: org?._id, name: org?.name ?? 'Unknown host' },
      price: t.priceCents ? { isFree: false, amountCents: t.priceCents, note: 'Pay at the door' } : { isFree: true },
      source: { kind: t.source, feed: feedFor(t.source, handle), handle },
      status: 'published',
      publishedAt,
      review: {
        flags: [],
        history: [
          { decision: 'submitted', at: new Date(publishedAt.getTime() - DAY) },
          { decision: 'approved', by: alex._id, at: publishedAt }
        ]
      },
      createdAt: new Date(publishedAt.getTime() - DAY),
      updatedAt: publishedAt
    };
    events.push(doc);
    popularity.set(String(doc._id), t.popularity);
    if (offset >= 0 && !firstByTemplate.has(t.key)) firstByTemplate.set(t.key, doc);
    usedOn.set(t.key, [...(usedOn.get(t.key) ?? []), offset]);
    return doc;
  };

  const templateByKey = new Map(TEMPLATES.map(t => [t.key, t]));
  for (const [key, offset] of ANCHORS) {
    const t = templateByKey.get(key);
    if (t) addTemplate(t, offset);
  }

  const fillable = TEMPLATES.filter(t => t.key !== 'karaoke');
  for (let offset = -56; offset <= 42; offset++) {
    const weekend = [5, 6].includes(weekday(addDays(today, offset)));
    const count = f.number.int({ min: 0, max: weekend ? 2 : 1 });
    for (let i = 0; i < count; i++) {
      const options = fillable.filter(t => !(usedOn.get(t.key) ?? []).some(o => Math.abs(o - offset) < 7));
      if (!options.length) break;
      addTemplate(f.helpers.arrayElement(options), offset);
    }
  }

  const radio = orgBySlug.get('campus-radio');
  for (const r of CAMPUS_RADIO) {
    const place = r.place ? placeByKey.get(r.place) : undefined;
    const startsAt = at(r.offset, r.hour, r.minute ?? 0);
    const submittedAt = new Date(Math.min(startsAt.getTime() - 12 * DAY, now.getTime() - 3 * DAY));
    const published = r.status === 'published';
    const publishedAt = published ? new Date(submittedAt.getTime() + 20 * HOUR) : undefined;
    const history: Record<string, unknown>[] = r.status === 'draft' ? [] : [{ decision: 'submitted', by: tim._id, at: submittedAt }];
    if (published) history.push({ decision: 'approved', by: alex._id, at: publishedAt });
    if (r.status === 'changes_requested') history.push({ decision: 'changes_requested', by: alex._id, note: r.note, at: new Date(submittedAt.getTime() + 6 * HOUR) });
    const doc: Doc = {
      _id: new Types.ObjectId(),
      title: r.title,
      description: r.description,
      category: r.category,
      startsAt,
      endsAt: new Date(startsAt.getTime() + r.minutes * MINUTE),
      location: { place: place?._id, detail: r.detail, text: locationText(place?.name, r.detail) },
      host: { organization: radio?._id, name: radio?.name ?? 'Campus Radio' },
      createdBy: tim._id,
      price: r.priceCents ? { isFree: false, amountCents: r.priceCents, note: 'Pay at the door' } : { isFree: true },
      source: { kind: 'organizer' },
      status: r.status,
      publishedAt,
      review: { flags: [], note: r.note, history },
      createdAt: new Date(submittedAt.getTime() - DAY),
      updatedAt: submittedAt
    };
    events.push(doc);
    if (r.popularity) popularity.set(String(doc._id), r.popularity);
    if (r.title === 'Battle of the bands') firstByTemplate.set('battle', doc);
  }

  for (const q of REVIEW_QUEUE) {
    const place = q.place ? placeByKey.get(q.place) : undefined;
    const startsAt = at(q.dayOffset, q.hour, q.minute ?? 0);
    const submittedAt = new Date(now.getTime() - f.number.int({ min: 1, max: 30 }) * HOUR);
    const org = orgs.find(o => o.name === q.hostName);
    const handle = q.handle ? `@${q.handle}` : undefined;
    events.push({
      _id: new Types.ObjectId(),
      title: q.title,
      description: q.description,
      category: q.category,
      startsAt,
      endsAt: new Date(startsAt.getTime() + q.minutes * MINUTE),
      location: { place: place?._id, text: q.locationText },
      host: { organization: org?._id, name: q.hostName },
      price: { isFree: true },
      source: { kind: q.source, feed: feedFor(q.source, handle), handle, externalId: `seed-${q.source}-${q.title.toLowerCase().replace(/\W+/g, '-')}` },
      status: 'in_review',
      review: {
        flags: q.flags.map(fl => ({ code: fl.code, message: fl.message, relatedEvent: fl.relatedTo ? firstByTemplate.get(fl.relatedTo)?._id : undefined })),
        history: [{ decision: 'submitted', at: submittedAt }]
      },
      createdAt: submittedAt,
      updatedAt: submittedAt
    });
  }

  const eventDocs = [];
  for (const raw of events) {
    const doc = new Event(raw);
    await doc.validate();
    eventDocs.push(doc.toObject());
  }
  await Event.collection.insertMany(eventDocs);

  const foundVia = (): FoundVia =>
    f.helpers.weightedArrayElement([
      { weight: 35, value: 'instagram' as const },
      { weight: 25, value: 'event_board' as const },
      { weight: 20, value: 'friends' as const },
      { weight: 12, value: 'search' as const },
      { weight: 8, value: 'map' as const }
    ]);
  const reminderPick = (): Reminder =>
    f.helpers.weightedArrayElement([
      { weight: 65, value: 'none' as const },
      { weight: 20, value: '1d' as const },
      { weight: 10, value: '1h' as const },
      { weight: 5, value: '1w' as const }
    ]);

  const rsvps: Record<string, unknown>[] = [];
  const reminderFields = (reminder: Reminder, startsAt: Date) => {
    if (reminder === 'none') return {};
    const when = new Date(startsAt.getTime() - REMINDER_MINUTES[reminder] * MINUTE);
    return when > now ? { remindAt: when } : { reminderSentAt: when };
  };

  for (const e of events) {
    if (e.status !== 'published') continue;
    const range = popularity.get(String(e._id));
    if (!range) continue;
    const startsAt = e.startsAt as Date;
    const endsAt = e.endsAt as Date;
    const publishedAt = e.publishedAt as Date;
    const wanted = Math.min(f.number.int({ min: range[0], max: range[1] }), crowd.length);
    for (const u of f.helpers.arrayElements(crowd, wanted)) {
      const daysBefore = 14 - 14 * Math.pow(f.number.float({ min: 0, max: 1 }), 1 / 1.7);
      const createdAt = new Date(Math.max(startsAt.getTime() - daysBefore * DAY, publishedAt.getTime() + HOUR));
      if (createdAt > now) continue;
      const reminder = reminderPick();
      const cancelled = f.datatype.boolean(0.05);
      const checkedIn = !cancelled && endsAt < now && f.datatype.boolean(0.72);
      rsvps.push({
        user: u._id,
        event: e._id,
        going: !cancelled,
        anonymous: f.datatype.boolean(0.1),
        inCalendar: f.datatype.boolean(0.25),
        reminder: cancelled ? 'none' : reminder,
        ...(cancelled ? {} : reminderFields(reminder, startsAt)),
        foundVia: foundVia(),
        checkedInAt: checkedIn ? new Date(startsAt.getTime() + f.number.int({ min: 0, max: 40 }) * MINUTE) : undefined,
        cancelledAt: cancelled ? new Date(Math.min(createdAt.getTime() + DAY, now.getTime())) : undefined,
        createdAt,
        updatedAt: createdAt
      });
    }
  }

  const deniseRsvp = (key: string, extra: Record<string, unknown>) => {
    const e = firstByTemplate.get(key);
    if (!e) return;
    const createdAt = new Date(now.getTime() - 2 * DAY);
    const reminder = (extra.reminder as Reminder | undefined) ?? 'none';
    rsvps.push({
      user: denise._id, event: e._id, going: true, anonymous: false, inCalendar: false, reminder, foundVia: 'instagram',
      ...reminderFields(reminder, e.startsAt as Date), ...extra, createdAt, updatedAt: createdAt
    });
  };
  deniseRsvp('open-mic', { reminder: '1d', inCalendar: true });
  deniseRsvp('pancakes', { anonymous: true });
  deniseRsvp('battle', { reminder: '1h' });
  const pastForDenise = f.helpers.arrayElements(
    events.filter(e => e.status === 'published' && (e.endsAt as Date) < now),
    6
  );
  for (const e of pastForDenise) {
    const createdAt = new Date((e.startsAt as Date).getTime() - 3 * DAY);
    rsvps.push({
      user: denise._id, event: e._id, going: true, anonymous: false, inCalendar: false, reminder: 'none', foundVia: 'friends',
      checkedInAt: new Date((e.startsAt as Date).getTime() + 10 * MINUTE), createdAt, updatedAt: createdAt
    });
  }

  const rsvpDocs = [];
  for (const raw of rsvps) {
    const doc = new Rsvp(raw);
    await doc.validate();
    rsvpDocs.push(doc.toObject());
  }
  if (rsvpDocs.length) await Rsvp.collection.insertMany(rsvpDocs);

  const counts = await Rsvp.aggregate<{ _id: Types.ObjectId; going: number; anonymous: number; checkedIn: number }>([
    { $match: { going: true } },
    {
      $group: {
        _id: '$event',
        going: { $sum: 1 },
        anonymous: { $sum: { $cond: ['$anonymous', 1, 0] } },
        checkedIn: { $sum: { $cond: [{ $ifNull: ['$checkedInAt', false] }, 1, 0] } }
      }
    }
  ]);
  if (counts.length) {
    await Event.bulkWrite(
      counts.map(c => ({
        updateOne: {
          filter: { _id: c._id },
          update: {
            $set: {
              'stats.goingCount': c.going,
              'stats.anonymousCount': c.anonymous,
              'stats.checkInCount': c.checkedIn,
              'stats.viewCount': c.going * f.number.int({ min: 4, max: 8 }) + f.number.int({ min: 10, max: 60 })
            }
          }
        }
      }))
    );
  }

  const weekEnd = campusTime(addDays(today, 7), 0);
  return {
    places: places.length,
    organizations: orgs.length,
    users: users.length,
    sources: sources.length,
    events: events.length,
    published: events.filter(e => e.status === 'published').length,
    reviewQueue: events.filter(e => e.status === 'in_review').length,
    rsvps: rsvpDocs.length,
    thisWeek: events.filter(e => e.status === 'published' && (e.endsAt as Date) >= now && (e.startsAt as Date) < weekEnd).length
  };
}
