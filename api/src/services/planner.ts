import type { Types } from 'mongoose';
import { CAMPUS_TIMEZONE, CATEGORIES, type Category, type PlannerDTO } from '@illi-knows/shared';
import { toEventSummary, toViewer, type LeanEvent, type LeanRsvp } from '../lib/serialize.js';
import { campusDay, campusTime } from '../lib/time.js';
import { Event, Rsvp, type UserDoc } from '../models/index.js';

const monthLabel = new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TIMEZONE, month: 'short' });
const monthKey = new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TIMEZONE, year: 'numeric', month: '2-digit' });

export function semesterOf(now: Date): { name: string; start: Date } {
  const { year, month } = campusDay(now);
  if (month >= 8) return { name: `Fall ${year}`, start: campusTime({ year, month: 8, day: 15 }, 0) };
  if (month >= 6) return { name: `Summer ${year}`, start: campusTime({ year, month: 5, day: 15 }, 0) };
  return { name: `Spring ${year}`, start: campusTime({ year, month: 1, day: 10 }, 0) };
}

type RsvpWithEvent = LeanRsvp & { event: LeanEvent | null; checkedInAt?: Date | null };

export async function buildPlanner(user: UserDoc, now = new Date()): Promise<PlannerDTO> {
  const semester = semesterOf(now);
  const rows = await Rsvp.find({ user: user._id, going: true })
    .populate({ path: 'event', populate: { path: 'location.place', select: 'key name' } })
    .lean<RsvpWithEvent[]>();
  const live = rows.filter((r): r is RsvpWithEvent & { event: LeanEvent } => !!r.event && r.event.status === 'published');

  const upcoming = live
    .filter(r => r.event.endsAt >= now)
    .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());
  const attended = live.filter(r => r.checkedInAt && r.event.startsAt >= semester.start && r.event.startsAt <= now);

  const months: { key: string; label: string; value: number }[] = [];
  for (let d = new Date(semester.start); d <= now; d = new Date(d.getTime() + 28 * 86_400_000)) {
    const key = monthKey.format(d);
    if (!months.some(m => m.key === key)) months.push({ key, label: monthLabel.format(d), value: 0 });
  }
  const nowKey = monthKey.format(now);
  if (!months.some(m => m.key === nowKey)) months.push({ key: nowKey, label: monthLabel.format(now), value: 0 });
  const byCategory = new Map<Category, number>();
  for (const r of attended) {
    const m = months.find(x => x.key === monthKey.format(r.event.startsAt));
    if (m) m.value += 1;
    const c = r.event.category as Category;
    byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
  }

  const goingIds = new Set(rows.map(r => String((r.event as LeanEvent | null)?._id ?? '')));
  const rank = [...CATEGORIES].sort((a, b) => (byCategory.get(b) ?? 0) - (byCategory.get(a) ?? 0));
  const candidates = await Event.find({ status: 'published', startsAt: { $gt: now } })
    .sort({ startsAt: 1 })
    .limit(40)
    .populate('location.place', 'key name')
    .lean<LeanEvent[]>();
  const suggestions = candidates
    .filter(e => !goingIds.has(String(e._id as Types.ObjectId)))
    .sort((a, b) => rank.indexOf(a.category as Category) - rank.indexOf(b.category as Category) || a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 4);

  return {
    semester: semester.name,
    upcoming: upcoming.map(r => toEventSummary(r.event, toViewer({ ...r, event: r.event._id }))),
    stats: {
      upcoming: upcoming.length,
      attendedThisSemester: attended.length,
      remindersSet: upcoming.filter(r => (r.reminder ?? 'none') !== 'none').length,
      inCalendar: upcoming.filter(r => r.inCalendar).length
    },
    attendedByMonth: months.map(({ label, value }) => ({ label, value })),
    attendedByCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
    suggestions: suggestions.map(e => toEventSummary(e))
  };
}
