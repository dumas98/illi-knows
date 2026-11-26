import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

/** Checks a shared secret in a header, in constant time. Answers 503 when the server has no key set. */
export function requireApiKey(key: string | undefined, header: string, setting: string): RequestHandler {
  return (req, _res, next) => {
    if (!key) throw new HttpError(503, 'not_configured', `This endpoint is not set up on this server. Set ${setting}.`);
    const given = Buffer.from(req.get(header) ?? '');
    const expected = Buffer.from(key);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new HttpError(401, 'bad_api_key', `Send the key in the ${header} header.`);
    }
    next();
  };
}
