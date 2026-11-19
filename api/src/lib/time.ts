import { CAMPUS_TIMEZONE } from '@illi-knows/shared';

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

export function campusTime(day: DateParts, hour: number, minute = 0, timeZone = CAMPUS_TIMEZONE): Date {
  const guess = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60000);
}

export function campusDay(date: Date = new Date(), timeZone = CAMPUS_TIMEZONE): DateParts {
  const p = partsIn(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

export function addDays(day: DateParts, n: number): DateParts {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function weekday(day: DateParts): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}
