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
