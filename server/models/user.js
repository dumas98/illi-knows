var mongoose = require('mongoose');
var { ROLES, REMINDERS } = require('./constants');

var UserSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
    authProvider: { type: String, enum: ['sso', 'password'], default: 'sso' },
    ssoSubject: { type: String },
    passwordHash: { type: String, select: false },
    roles: {
        type: [{ type: String, enum: ROLES }],
        default: ['student'],
        validate: { validator: v => v.length > 0, message: 'A user needs at least one role.' }
    },
    preferences: {
        defaultReminder: { type: String, enum: REMINDERS, default: 'none' },
        rsvpAnonymously: { type: Boolean, default: false },
        emailReminders: { type: Boolean, default: true }
    },
    lastLoginAt: { type: Date }
}, { timestamps: true, versionKey: false });

UserSchema.index({ ssoSubject: 1 }, { unique: true, partialFilterExpression: { ssoSubject: { $type: 'string' } } });

module.exports = mongoose.model('User', UserSchema);
