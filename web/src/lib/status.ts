import { EVENT_STATUS_LABELS, type OrganizerEventDTO } from '@illi-knows/shared';

/** Published events that have ended read as "Past". */
export function statusLabel(e: Pick<OrganizerEventDTO, 'status' | 'ended'>): string {
  return e.ended && e.status === 'published' ? 'Past' : EVENT_STATUS_LABELS[e.status];
}

export function statusClass(e: Pick<OrganizerEventDTO, 'status' | 'ended'>): string {
  if (e.ended && e.status === 'published') return 's-past';
  return { draft: 's-draft', in_review: 's-review', changes_requested: 's-changes', published: 's-published', rejected: 's-rejected', cancelled: 's-past' }[e.status];
}
