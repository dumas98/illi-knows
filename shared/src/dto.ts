import type { Category, EventStatus, FoundVia, PlaceKind, Reminder, Role, SourceKind } from './constants.js';

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
  center: [number, number];
  outline: [number, number][] | null;
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
  /** Include events that have already ended. Off by default. */
  includePast?: boolean;
  limit?: number;
  cursor?: string;
}

export interface RsvpUpdate {
  going?: boolean;
  anonymous?: boolean;
  inCalendar?: boolean;
  reminder?: Reminder;
  foundVia?: FoundVia;
}

export interface PlannerDTO {
  semester: string;
  upcoming: EventSummaryDTO[];
  stats: { upcoming: number; attendedThisSemester: number; remindersSet: number; inCalendar: number };
  attendedByMonth: { label: string; value: number }[];
  attendedByCategory: { label: Category; value: number }[];
  suggestions: EventSummaryDTO[];
}

/** What the create and edit form sends. Dates and times are campus time. */
export interface EventInput {
  title: string;
  description: string;
  category: Category;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  startTime: string;
  /** HH:MM, 24-hour. Earlier than startTime means the event ends the next day. */
  endTime: string;
  /** A campus place key, or null when the event isn't on the map. */
  placeKey: string | null;
  /** Room or spot inside the place ("Room 12"). */
  locationDetail: string;
  /** Free-text location, used when placeKey is null. */
  locationText: string;
  /** Host organization, or null to host as yourself. */
  organizationId: string | null;
  isFree: boolean;
  priceDollars: number | null;
  priceNote: string;
  /** true sends the event for review; false saves a draft. */
  submit: boolean;
}

export interface OrganizerEventDTO extends EventSummaryDTO {
  status: EventStatus;
  description: string;
  /** The event has ended. */
  ended: boolean;
  /** The reviewer's latest note, shown when changes are requested. */
  reviewNote: string | null;
  stats: { going: number; anonymous: number; checkedIn: number; views: number };
  submittedAt: string | null;
  updatedAt: string;
  /** Editing is allowed (not ended, rejected, or cancelled). */
  editable: boolean;
}

export interface InsightsDTO {
  event: OrganizerEventDTO;
  /** New RSVPs per day, 13 days before the event down to the event day (0). */
  rsvpsByDay: { daysBefore: number; count: number }[];
  /** RSVPs made more than two weeks ahead. */
  earlier: number;
  foundVia: { label: string; value: number }[];
  /** Your past published events, oldest first. */
  past: { id: string; title: string; startsAt: string; going: number; checkedIn: number }[];
}
