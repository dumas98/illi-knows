import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { PLACE_KINDS } from '@illi-knows/shared';

const PlaceSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    name: { type: String, required: true, trim: true },
    aliases: { type: [{ type: String, lowercase: true, trim: true }], default: [] },
    kind: { type: String, enum: PLACE_KINDS, default: 'building' },
    osmId: { type: String, trim: true },
    facilityNumber: { type: String, trim: true },
    geo: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: {
        type: [Number],
        required: true,
        validate: { validator: (v: number[]) => v.length === 2, message: 'geo needs [longitude, latitude].' }
      }
    },
    outline: {
      type: { type: String, enum: ['Polygon'] },
      coordinates: { type: [[[Number]]], default: undefined }
    },
    address: { type: String, trim: true }
  },
  { timestamps: true, versionKey: false }
);

PlaceSchema.index({ aliases: 1 });
PlaceSchema.index({ geo: '2dsphere' });
PlaceSchema.index({ osmId: 1 }, { unique: true, partialFilterExpression: { osmId: { $type: 'string' } } });

export type PlaceAttrs = InferSchemaType<typeof PlaceSchema>;
export type PlaceDoc = HydratedDocumentFromSchema<typeof PlaceSchema>;
export const Place = model('Place', PlaceSchema);
