var mongoose = require('mongoose');
var { CATEGORIES, EVENT_STATUSES, REVIEW_DECISIONS, SOURCE_KINDS, FLAG_CODES } = require('./constants');

var ObjectId = mongoose.Schema.Types.ObjectId;

var FlagSchema = new mongoose.Schema({
    code: { type: String, enum: FLAG_CODES, required: true },
    message: { type: String, trim: true },
    relatedEvent: { type: ObjectId, ref: 'Event' }
}, { _id: false });

var ReviewEntrySchema = new mongoose.Schema({
    decision: { type: String, enum: REVIEW_DECISIONS, required: true },
    by: { type: ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now }
}, { _id: false });

var EventSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    category: { type: String, enum: CATEGORIES, required: true },
    startsAt: { type: Date, required: true },
    endsAt: {
        type: Date,
        required: true,
        validate: { validator: function (v) { return !this.startsAt || v > this.startsAt; }, message: 'endsAt must be after startsAt.' }
    },
    location: {
        place: { type: ObjectId, ref: 'Place' },
        detail: { type: String, trim: true, maxlength: 120 },
        text: { type: String, trim: true, maxlength: 200 }
    },
    host: {
        organization: { type: ObjectId, ref: 'Organization' },
        name: { type: String, required: true, trim: true, maxlength: 100 }
    },
    createdBy: { type: ObjectId, ref: 'User' },
    price: {
        isFree: { type: Boolean, default: true },
        amountCents: { type: Number, min: 0 },
        note: { type: String, trim: true, maxlength: 80 }
    },
    source: {
        kind: { type: String, enum: SOURCE_KINDS, default: 'organizer' },
        feed: { type: ObjectId, ref: 'Source' },
        handle: { type: String, trim: true },
        url: { type: String, trim: true },
        externalId: { type: String, trim: true }
    },
    status: { type: String, enum: EVENT_STATUSES, default: 'draft' },
    publishedAt: { type: Date },
    review: {
        flags: { type: [FlagSchema], default: [] },
        note: { type: String, trim: true, maxlength: 1000 },
        history: { type: [ReviewEntrySchema], default: [] }
    },
    stats: {
        goingCount: { type: Number, min: 0, default: 0 },
        anonymousCount: { type: Number, min: 0, default: 0 },
        checkInCount: { type: Number, min: 0, default: 0 },
        viewCount: { type: Number, min: 0, default: 0 }
    }
}, { timestamps: true, versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true } });

EventSchema.virtual('isPast').get(function () {
    return !!this.endsAt && this.endsAt < new Date();
});

EventSchema.virtual('isOnMap').get(function () {
    return !!(this.location && this.location.place);
});

EventSchema.index({ status: 1, startsAt: 1 });
EventSchema.index({ status: 1, category: 1, startsAt: 1 });
EventSchema.index({ status: 1, 'source.kind': 1, startsAt: 1 });
EventSchema.index({ 'location.place': 1, startsAt: 1 });
EventSchema.index({ 'host.organization': 1, startsAt: -1 });
EventSchema.index({ createdBy: 1, startsAt: -1 });
EventSchema.index(
    { 'source.kind': 1, 'source.externalId': 1 },
    { unique: true, partialFilterExpression: { 'source.externalId': { $type: 'string' } } }
);
EventSchema.index(
    { title: 'text', 'host.name': 'text', 'location.text': 'text', description: 'text' },
    { weights: { title: 10, 'host.name': 5, 'location.text': 3, description: 1 }, name: 'event_search' }
);

module.exports = mongoose.model('Event', EventSchema);
