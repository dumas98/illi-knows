import type { EventSummaryDTO } from '@illi-knows/shared';
import { campusMinutes } from './format';

/** The grid shows 8 am to 11 pm; earlier or later events are pinned to the edges. */
export const FIRST_HOUR = 8;
export const LAST_HOUR = 23;
export const HOUR_PX = 40;
export const MIN_BLOCK_PX = 34;
export const START = FIRST_HOUR * 60;
export const END = LAST_HOUR * 60;

export interface Placed {
  event: EventSummaryDTO;
  start: number;
  end: number;
  lane: number;
}

/** Puts overlapping events side by side in lanes. */
export function layoutDay(events: EventSummaryDTO[]): { placed: Placed[]; lanes: number } {
  const sorted = [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const laneEnds: number[] = [];
  const placed = sorted.map(event => {
    const length = Math.max(30, (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60_000);
    const start = Math.min(Math.max(campusMinutes(event.startsAt), START), END - 45);
    const end = Math.min(start + length, END);
    let lane = laneEnds.findIndex(e => e <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else laneEnds[lane] = end;
    return { event, start, end, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}
