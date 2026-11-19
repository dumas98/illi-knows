import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { MAP_SIZE, PLACE_KINDS } from '@illi-knows/shared';

const PlaceSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    name: { type: String, required: true, trim: true },
    aliases: { type: [{ type: String, lowercase: true, trim: true }], default: [] },
    kind: { type: String, enum: PLACE_KINDS, default: 'building' },
    map: {
      x: { type: Number, required: true, min: 0, max: MAP_SIZE.width },
      y: { type: Number, required: true, min: 0, max: MAP_SIZE.height },
      w: { type: Number, required: true, min: 1 },
      h: { type: Number, required: true, min: 1 }
    },
    geo: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined }
    },
    address: { type: String, trim: true }
  },
  { timestamps: true, versionKey: false }
);

PlaceSchema.index({ aliases: 1 });
PlaceSchema.index({ geo: '2dsphere' }, { sparse: true });

export type PlaceAttrs = InferSchemaType<typeof PlaceSchema>;
export type PlaceDoc = HydratedDocumentFromSchema<typeof PlaceSchema>;
export const Place = model('Place', PlaceSchema);
