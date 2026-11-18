const ROLES = ['student', 'organizer', 'admin'];

const CATEGORIES = ['Music', 'Food', 'Sports', 'Career', 'Arts'];

const REMINDER_MINUTES = { none: 0, '1h': 60, '1d': 1440, '1w': 10080 };
const REMINDERS = Object.keys(REMINDER_MINUTES);

const EVENT_STATUSES = ['draft', 'in_review', 'changes_requested', 'published', 'rejected', 'cancelled'];

const REVIEW_DECISIONS = ['submitted', 'approved', 'changes_requested', 'rejected'];

const SOURCE_KINDS = ['organizer', 'event_board', 'instagram', 'word_of_mouth'];

const FLAG_CODES = ['location_missing', 'possible_duplicate', 'not_an_event', 'date_from_image', 'other'];

const FOUND_VIA = ['instagram', 'event_board', 'friends', 'search', 'map', 'other'];

const PLACE_KINDS = ['building', 'quad', 'field'];

const ORG_KINDS = ['club', 'department', 'office', 'other'];

module.exports = {
    ROLES,
    CATEGORIES,
    REMINDER_MINUTES,
    REMINDERS,
    EVENT_STATUSES,
    REVIEW_DECISIONS,
    SOURCE_KINDS,
    FLAG_CODES,
    FOUND_VIA,
    PLACE_KINDS,
    ORG_KINDS
};
