import { addDaysKey, weekdayIndex, weekStartKey } from './format';

export const WHENS = [
  ['', 'Any time'],
  ['today', 'Today'],
  ['this-week', 'This week'],
  ['weekend', 'This weekend'],
  ['next-week', 'Next week']
] as const;
export type When = (typeof WHENS)[number][0];

/** Start (inclusive) and end (exclusive) campus days for a "when" chip. */
export function whenRange(when: When, today: string): { from: string; to: string } | null {
  const monday = weekStartKey(today);
  switch (when) {
    case 'today':
      return { from: today, to: addDaysKey(today, 1) };
    case 'this-week':
      return { from: today, to: addDaysKey(monday, 7) };
    case 'weekend': {
      const saturday = addDaysKey(monday, 5);
      return { from: weekdayIndex(today) >= 5 ? today : saturday, to: addDaysKey(monday, 7) };
    }
    case 'next-week':
      return { from: addDaysKey(monday, 7), to: addDaysKey(monday, 14) };
    default:
      return null;
  }
}
