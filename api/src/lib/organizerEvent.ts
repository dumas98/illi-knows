import type { EventStatus, OrganizerEventDTO } from '@illi-knows/shared';
import { toEventSummary, type LeanEvent } from './serialize.js';

export interface LeanOrganizerEvent extends LeanEvent {
  description?: string | null;
  review?: { note?: string | null; history?: { decision: string; at?: Date | null }[] | null } | null;
  stats?: { goingCount?: number | null; anonymousCount?: number | null; checkInCount?: number | null; viewCount?: number | null } | null;
  updatedAt?: Date | null;
}

export function toOrganizerEvent(e: LeanOrganizerEvent, now = new Date()): OrganizerEventDTO {
  const ended = e.endsAt < now;
  const status = e.status as EventStatus;
  const submitted = [...(e.review?.history ?? [])].reverse().find(h => h.decision === 'submitted');
  return {
    ...toEventSummary(e),
    status,
    description: e.description ?? '',
    ended,
    reviewNote: status === 'changes_requested' || status === 'rejected' ? (e.review?.note ?? null) : null,
    stats: {
      going: e.stats?.goingCount ?? 0,
      anonymous: e.stats?.anonymousCount ?? 0,
      checkedIn: e.stats?.checkInCount ?? 0,
      views: e.stats?.viewCount ?? 0
    },
    submittedAt: submitted?.at?.toISOString() ?? null,
    updatedAt: (e.updatedAt ?? e.startsAt).toISOString(),
    editable: !ended && status !== 'rejected' && status !== 'cancelled'
  };
}
