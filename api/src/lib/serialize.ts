import type { Types } from 'mongoose';
import type {
  Category,
  EventDetailDTO,
  EventStatus,
  EventSummaryDTO,
  PlaceDTO,
  PlaceKind,
  PlaceRefDTO,
  Reminder,
  SourceKind,
  ViewerRsvpDTO
} from '@illi-knows/shared';

interface LeanPlaceRef {
  _id: Types.ObjectId;
  key: string;
  name: string;
}

export interface LeanEvent {
  _id: Types.ObjectId;
  title: string;
  description?: string | null;
  category: string;
  startsAt: Date;
  endsAt: Date;
  location?: { place?: LeanPlaceRef | Types.ObjectId | null; detail?: string | null; text?: string | null } | null;
  host: { name: string; organization?: Types.ObjectId | null };
  createdBy?: Types.ObjectId | null;
  price?: { isFree?: boolean | null; amountCents?: number | null; note?: string | null } | null;
  source?: { kind?: string | null; handle?: string | null } | null;
  status: string;
  publishedAt?: Date | null;
  stats?: { goingCount?: number | null } | null;
}

export interface LeanRsvp {
  event: Types.ObjectId;
  going?: boolean | null;
  anonymous?: boolean | null;
  inCalendar?: boolean | null;
  reminder?: string | null;
}

export interface LeanPlace {
  _id: Types.ObjectId;
  key: string;
  name: string;
  kind?: string | null;
  map: { x: number; y: number; w: number; h: number };
}

function isPlaceRef(p: unknown): p is LeanPlaceRef {
  return !!p && typeof p === 'object' && 'key' in p && 'name' in p;
}

export function toViewer(r: LeanRsvp | undefined | null): ViewerRsvpDTO | null {
  if (!r) return null;
  return {
    going: r.going ?? false,
    anonymous: r.anonymous ?? false,
    inCalendar: r.inCalendar ?? false,
    reminder: (r.reminder ?? 'none') as Reminder
  };
}

export function toEventSummary(e: LeanEvent, viewer: ViewerRsvpDTO | null = null): EventSummaryDTO {
  const p = e.location?.place;
  const place: PlaceRefDTO | null = isPlaceRef(p) ? { id: String(p._id), key: p.key, name: p.name } : null;
  return {
    id: String(e._id),
    title: e.title,
    category: e.category as Category,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    place,
    locationText: e.location?.text ?? place?.name ?? '',
    locationDetail: e.location?.detail ?? null,
    host: { name: e.host.name, organizationId: e.host.organization ? String(e.host.organization) : null },
    price: {
      isFree: e.price?.isFree ?? true,
      amountCents: e.price?.amountCents ?? null,
      note: e.price?.note ?? null
    },
    source: { kind: (e.source?.kind ?? 'organizer') as SourceKind, handle: e.source?.handle ?? null },
    goingCount: e.stats?.goingCount ?? 0,
    viewer
  };
}

export function toEventDetail(e: LeanEvent, viewer: ViewerRsvpDTO | null = null): EventDetailDTO {
  return {
    ...toEventSummary(e, viewer),
    description: e.description ?? '',
    status: e.status as EventStatus,
    publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null
  };
}

export function toPlace(p: LeanPlace): PlaceDTO {
  return {
    id: String(p._id),
    key: p.key,
    name: p.name,
    kind: (p.kind ?? 'building') as PlaceKind,
    map: { x: p.map.x, y: p.map.y, w: p.map.w, h: p.map.h }
  };
}
