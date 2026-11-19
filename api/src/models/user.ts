import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { REMINDERS, ROLES } from '@illi-knows/shared';

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
    firebaseUid: { type: String },
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: ['student'],
      validate: { validator: (v: string[]) => v.length > 0, message: 'A user needs at least one role.' }
    },
    preferences: {
      defaultReminder: { type: String, enum: REMINDERS, default: 'none' },
      rsvpAnonymously: { type: Boolean, default: false },
      emailReminders: { type: Boolean, default: true }
    },
    lastLoginAt: { type: Date }
  },
  { timestamps: true, versionKey: false }
);

UserSchema.index({ firebaseUid: 1 }, { unique: true, partialFilterExpression: { firebaseUid: { $type: 'string' } } });

export type UserAttrs = InferSchemaType<typeof UserSchema>;
export type UserDoc = HydratedDocumentFromSchema<typeof UserSchema>;
export const User = model('User', UserSchema);
