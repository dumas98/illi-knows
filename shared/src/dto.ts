import type { Category, EventStatus, FeedKind, FlagCode, FoundVia, PlaceKind, Reminder, ReviewDecision, Role, SourceKind } from './constants.js';

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

export const REVIEW_TABS = ['pending', 'approved', 'changes_requested', 'rejected'] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];
export const REVIEW_TAB_LABELS: Record<ReviewTab, string> = {
  pending: 'Pending',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  rejected: 'Rejected'
};

export interface ReviewFlagDTO {
  code: FlagCode;
  message: string;
  /** For possible duplicates: the event it may duplicate. */
  relatedEvent: { id: string; title: string } | null;
}

export interface ReviewItemDTO extends OrganizerEventDTO {
  /** Where the listing came from, written for people: "Instagram, @acousticclub". */
  from: string;
  flags: ReviewFlagDTO[];
  lastDecision: { decision: ReviewDecision; at: string; by: string | null; note: string | null } | null;
}

export interface ReviewQueueDTO {
  tab: ReviewTab;
  items: ReviewItemDTO[];
  counts: Record<ReviewTab, number>;
}

export const REVIEW_ACTIONS = ['approve', 'request_changes', 'reject', 'reopen'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface ReviewDecisionInput {
  action: ReviewAction;
  /** Required for request_changes. Shown to the organizer. */
  note?: string;
}

export interface SourceSummaryDTO {
  kind: FeedKind;
  label: string;
  mode: 'automatic' | 'manual';
  sources: number;
  syncEveryMinutes: number | null;
  lastRunAt: string | null;
  /** New listings from the most recent run of each source. */
  newListings: number;
  /** Listings from this kind of source waiting for review. */
  pending: number;
  error: string | null;
}

/** What an admin enters for a word-of-mouth tip (a flyer, a group chat message). */
export type TipInput = Omit<EventInput, 'organizationId' | 'submit'> & { hostName: string };

/** One listing from the ingestion pipeline. See docs/ingestion-contract.md. */
export interface IngestListing {
  /** Stable id from the source (post id, calendar UID). Re-sending it updates the same listing. */
  externalId: string;
  title: string;
  description?: string;
  category: Category;
  /** ISO 8601 with an offset or Z, e.g. 2026-12-03T19:00:00-06:00 */
  startsAt: string;
  endsAt?: string;
  /** Location as written in the source: "Union courtyard", "Siebel 1404". */
  location?: string;
  hostName?: string;
  price?: { isFree: boolean; amountCents?: number; note?: string };
  url?: string;
  /** The date was read from an image (OCR), so a reviewer should double-check it. */
  dateFromImage?: boolean;
  /** The extractor isn't sure this is an event. */
  maybeNotEvent?: boolean;
}

export interface IngestRequest {
  source: { kind: FeedKind; name: string; handle?: string; url?: string };
  listings: IngestListing[];
}

export type IngestResult = 'created' | 'updated' | 'unchanged' | 'invalid';

export interface IngestResponse {
  source: { id: string; name: string };
  counts: Record<IngestResult, number>;
  results: { externalId: string; result: IngestResult; eventId: string | null; flags: FlagCode[]; errors?: Record<string, string[]>; reason?: string }[];
}
