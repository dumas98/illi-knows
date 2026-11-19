import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { FOUND_VIA, REMINDERS } from '@illi-knows/shared';

const RsvpSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    going: { type: Boolean, default: true },
    anonymous: { type: Boolean, default: false },
    inCalendar: { type: Boolean, default: false },
    reminder: { type: String, enum: REMINDERS, default: 'none' },
    remindAt: { type: Date },
    reminderSentAt: { type: Date },
    foundVia: { type: String, enum: FOUND_VIA },
    checkedInAt: { type: Date },
    cancelledAt: { type: Date }
  },
  { timestamps: true, versionKey: false }
);

RsvpSchema.index({ user: 1, event: 1 }, { unique: true });
RsvpSchema.index({ event: 1, going: 1, anonymous: 1 });
RsvpSchema.index({ user: 1, going: 1 });
RsvpSchema.index({ remindAt: 1 }, { partialFilterExpression: { remindAt: { $type: 'date' } } });

export type RsvpAttrs = InferSchemaType<typeof RsvpSchema>;
export type RsvpDoc = HydratedDocumentFromSchema<typeof RsvpSchema>;
export const Rsvp = model('Rsvp', RsvpSchema);
