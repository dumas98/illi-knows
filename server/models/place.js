var mongoose = require('mongoose');
var { PLACE_KINDS } = require('./constants');

var PlaceSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    name: { type: String, required: true, trim: true },
    aliases: { type: [{ type: String, lowercase: true, trim: true }], default: [] },
    kind: { type: String, enum: PLACE_KINDS, default: 'building' },
    map: {
        x: { type: Number, required: true, min: 0, max: 800 },
        y: { type: Number, required: true, min: 0, max: 520 },
        w: { type: Number, required: true, min: 1 },
        h: { type: Number, required: true, min: 1 }
    },
    geo: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number], default: undefined }
    },
    address: { type: String, trim: true }
}, { timestamps: true, versionKey: false });

PlaceSchema.index({ aliases: 1 });
PlaceSchema.index({ geo: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Place', PlaceSchema);
