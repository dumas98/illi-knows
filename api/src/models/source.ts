import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { FEED_KINDS } from '@illi-knows/shared';

const SourceSchema = new Schema(
  {
    kind: { type: String, enum: FEED_KINDS, required: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, trim: true },
    handle: { type: String, trim: true, lowercase: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    mode: { type: String, enum: ['automatic', 'manual'], default: 'manual' },
    syncEveryMinutes: { type: Number, min: 5 },
    active: { type: Boolean, default: true },
    lastRun: {
      at: { type: Date },
      newListings: { type: Number, min: 0, default: 0 },
      error: { type: String }
    }
  },
  { timestamps: true, versionKey: false }
);

SourceSchema.index({ kind: 1, handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } });
SourceSchema.index({ kind: 1, active: 1 });

export type SourceAttrs = InferSchemaType<typeof SourceSchema>;
export type SourceDoc = HydratedDocumentFromSchema<typeof SourceSchema>;
export const Source = model('Source', SourceSchema);
