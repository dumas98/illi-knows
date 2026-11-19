import { Schema, model, type HydratedDocumentFromSchema, type InferSchemaType } from 'mongoose';
import { ORG_KINDS } from '@illi-knows/shared';

const MemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor'], default: 'editor' }
  },
  { _id: false }
);

const OrganizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    kind: { type: String, enum: ORG_KINDS, default: 'club' },
    instagramHandle: { type: String, trim: true, lowercase: true },
    members: { type: [MemberSchema], default: [] },
    verified: { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false }
);

OrganizationSchema.index({ 'members.user': 1 });

export type OrganizationAttrs = InferSchemaType<typeof OrganizationSchema>;
export type OrganizationDoc = HydratedDocumentFromSchema<typeof OrganizationSchema>;
export const Organization = model('Organization', OrganizationSchema);
