var mongoose = require('mongoose');

var SourceSchema = new mongoose.Schema({
    kind: { type: String, enum: ['event_board', 'instagram', 'word_of_mouth'], required: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    handle: { type: String, trim: true, lowercase: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    mode: { type: String, enum: ['automatic', 'manual'], default: 'manual' },
    syncEveryMinutes: { type: Number, min: 5 },
    active: { type: Boolean, default: true },
    lastRun: {
        at: { type: Date },
        newListings: { type: Number, min: 0, default: 0 },
        error: { type: String }
    }
}, { timestamps: true, versionKey: false });

SourceSchema.index({ kind: 1, handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } });
SourceSchema.index({ kind: 1, active: 1 });

module.exports = mongoose.model('Source', SourceSchema);
