var mongoose = require('mongoose');
var { ORG_KINDS } = require('./constants');

var MemberSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor'], default: 'editor' }
}, { _id: false });

var OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    kind: { type: String, enum: ORG_KINDS, default: 'club' },
    instagramHandle: { type: String, trim: true, lowercase: true },
    members: { type: [MemberSchema], default: [] },
    verified: { type: Boolean, default: false }
}, { timestamps: true, versionKey: false });

OrganizationSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Organization', OrganizationSchema);
