import { Types } from 'mongoose';
import { z } from 'zod';
import { HttpError } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'invalid_request', 'Some fields are missing or invalid.', z.flattenError(result.error).fieldErrors);
  }
  return result.data;
}

export const objectId = z
  .string()
  .refine(v => Types.ObjectId.isValid(v) && String(new Types.ObjectId(v)) === v, 'Invalid id.')
  .transform(v => new Types.ObjectId(v));
