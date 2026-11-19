import type { Category, EventStatus, PlaceKind, Reminder, Role, SourceKind } from './constants.js';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PlaceDTO {
  id: string;
  key: string;
  name: string;
  kind: PlaceKind;
  map: { x: number; y: number; w: number; h: number };
}

export interface PlaceRefDTO {
  id: string;
  key: string;
  name: string;
}

export interface ViewerRsvpDTO {
  going: boolean;
  anonymous: boolean;
  inCalendar: boolean;
  reminder: Reminder;
}

export interface EventSummaryDTO {
  id: string;
  title: string;
  category: Category;
  startsAt: string;
  endsAt: string;
  place: PlaceRefDTO | null;
  locationText: string;
  locationDetail: string | null;
  host: { name: string; organizationId: string | null };
  price: { isFree: boolean; amountCents: number | null; note: string | null };
  source: { kind: SourceKind; handle: string | null };
  goingCount: number;
  viewer: ViewerRsvpDTO | null;
}

export interface EventDetailDTO extends EventSummaryDTO {
  description: string;
  status: EventStatus;
  publishedAt: string | null;
}

export interface AttendeeDTO {
  id: string;
  name: string;
  initials: string;
}

export interface AttendeesDTO {
  total: number;
  shown: AttendeeDTO[];
}

export interface MeDTO {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  preferences: { defaultReminder: Reminder; rsvpAnonymously: boolean; emailReminders: boolean };
  organizations: { id: string; name: string; slug: string }[];
}

export interface EventsQuery {
  from?: string;
  to?: string;
  category?: Category;
  source?: SourceKind;
  free?: boolean;
  q?: string;
  place?: string;
  limit?: number;
  cursor?: string;
}
