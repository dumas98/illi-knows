import { CAMPUS_TIMEZONE } from '@illi-knows/shared';

const tz = { timeZone: CAMPUS_TIMEZONE } as const;
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortDay = new Intl.DateTimeFormat('en-US', { ...tz, weekday: 'short', month: 'short', day: 'numeric' });
const longDay = new Intl.DateTimeFormat('en-US', { ...tz, weekday: 'long', month: 'long', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { ...tz, hour: 'numeric', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('en-US', { ...tz, month: 'short' });
const dayNumFmt = new Intl.DateTimeFormat('en-US', { ...tz, day: 'numeric' });

export const dayKey = (d: Date | string) => dayKeyFmt.format(new Date(d));
export const fmtDay = (d: Date | string) => shortDay.format(new Date(d));
export const fmtLongDay = (d: Date | string) => longDay.format(new Date(d));
export const fmtTime = (d: Date | string) => timeFmt.format(new Date(d)).replace(' AM', ' am').replace(' PM', ' pm');
export const fmtMonth = (d: Date | string) => monthFmt.format(new Date(d));
export const fmtDayNum = (d: Date | string) => dayNumFmt.format(new Date(d));

export function relativeDay(d: Date | string, now = new Date()): string {
  const days = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(now))) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return fmtLongDay(d).split(',')[0] ?? '';
}

export function fmtPrice(price: { isFree: boolean; amountCents: number | null }): string {
  if (price.isFree || !price.amountCents) return 'Free';
  const dollars = price.amountCents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p.charAt(0).toUpperCase())
    .join('');
}

export const catClass = (category: string) => `cat-${category.toLowerCase()}`;

/* Campus calendar math. Day keys are YYYY-MM-DD in campus time; weeks start on Monday. */

const partsFmt = new Intl.DateTimeFormat('en-US', {
  ...tz,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric'
});

function campusParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map(x => [x.type, Number(x.value)]));
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, min: p.minute! };
}

/** Minutes after midnight, campus time. */
export function campusMinutes(d: Date | string): number {
  const p = campusParts(new Date(d));
  return p.h * 60 + p.min;
}

/** The instant campus clocks read 00:00 on this day. */
export function campusMidnight(key: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = campusParts(new Date(guess));
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += target - shown;
  }
  return new Date(guess);
}

const keyDate = (key: string) => new Date(`${key}T12:00:00Z`);

export function addDaysKey(key: string, days: number): string {
  const d = keyDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (key: string) => (keyDate(key).getUTCDay() + 6) % 7;

export const weekStartKey = (key: string) => addDaysKey(key, -weekdayIndex(key));

const keyMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' });
const keyDow = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
export const keyMonthName = (key: string) => keyMonth.format(keyDate(key));
export const keyDowName = (key: string) => keyDow.format(keyDate(key));
export const keyDayNum = (key: string) => keyDate(key).getUTCDate();

export function weekLabel(start: string): string {
  const end = addDaysKey(start, 6);
  const a = `${keyMonthName(start)} ${keyDayNum(start)}`;
  return keyMonthName(start) === keyMonthName(end) ? `${a} to ${keyDayNum(end)}` : `${a} to ${keyMonthName(end)} ${keyDayNum(end)}`;
}

const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

/** "12 minutes ago", "yesterday", "3 days ago". Pass `now` from state so rendering stays pure. */
export function timeAgo(iso: string, now: number): string {
  const s = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86_400), 'day');
}
