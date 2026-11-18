var mongoose = require('mongoose');
var { REMINDERS, FOUND_VIA } = require('./constants');

var ObjectId = mongoose.Schema.Types.ObjectId;

var RsvpSchema = new mongoose.Schema({
    user: { type: ObjectId, ref: 'User', required: true },
    event: { type: ObjectId, ref: 'Event', required: true },
    going: { type: Boolean, default: true },
    anonymous: { type: Boolean, default: false },
    inCalendar: { type: Boolean, default: false },
    reminder: { type: String, enum: REMINDERS, default: 'none' },
    remindAt: { type: Date },
    reminderSentAt: { type: Date },
    foundVia: { type: String, enum: FOUND_VIA },
    checkedInAt: { type: Date },
    cancelledAt: { type: Date }
}, { timestamps: true, versionKey: false });

RsvpSchema.index({ user: 1, event: 1 }, { unique: true });
RsvpSchema.index({ event: 1, going: 1, anonymous: 1 });
RsvpSchema.index({ user: 1, going: 1 });
RsvpSchema.index({ remindAt: 1 }, { partialFilterExpression: { remindAt: { $type: 'date' } } });

module.exports = mongoose.model('Rsvp', RsvpSchema);
