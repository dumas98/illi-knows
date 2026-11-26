export const CAMPUS_TIMEZONE = 'America/Chicago';
export const CAMPUS_EMAIL_DOMAIN = 'illinois.edu';

export const ROLES = ['student', 'organizer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = ['Music', 'Food', 'Sports', 'Career', 'Arts'] as const;
export type Category = (typeof CATEGORIES)[number];

export const REMINDER_MINUTES = { none: 0, '1h': 60, '1d': 1440, '1w': 10080 } as const;
export type Reminder = keyof typeof REMINDER_MINUTES;
export const REMINDERS = Object.keys(REMINDER_MINUTES) as Reminder[];
export const REMINDER_LABELS: Record<Reminder, string> = {
  none: 'No reminder',
  '1h': '1 hour before',
  '1d': '1 day before',
  '1w': '1 week before'
};

export const EVENT_STATUSES = ['draft', 'in_review', 'changes_requested', 'published', 'rejected', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Needs changes',
  published: 'Published',
  rejected: 'Rejected',
  cancelled: 'Cancelled'
};

export const REVIEW_DECISIONS = ['submitted', 'approved', 'changes_requested', 'rejected'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const SOURCE_KINDS = ['organizer', 'event_board', 'instagram', 'word_of_mouth'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const FEED_KINDS = ['event_board', 'instagram', 'word_of_mouth'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];
export const SOURCE_LABELS: Record<SourceKind, string> = {
  organizer: 'Organizer',
  event_board: 'Event board',
  instagram: 'Instagram',
  word_of_mouth: 'Word of mouth'
};

export const FLAG_CODES = ['location_missing', 'possible_duplicate', 'not_an_event', 'date_from_image', 'other'] as const;
export type FlagCode = (typeof FLAG_CODES)[number];

export const FOUND_VIA = ['instagram', 'event_board', 'friends', 'search', 'map', 'other'] as const;
export type FoundVia = (typeof FOUND_VIA)[number];
export const FOUND_VIA_LABELS: Record<FoundVia, string> = {
  instagram: 'Instagram',
  event_board: 'Event board',
  friends: 'Friends',
  search: 'Search',
  map: 'Map',
  other: 'Other'
};

export const PLACE_KINDS = ['building', 'residence', 'library', 'venue', 'recreation', 'quad', 'green', 'field'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const ORG_KINDS = ['club', 'department', 'office', 'other'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];
