import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@illi-knows/shared';
import { HttpError, forbidden, unauthorized } from '../lib/errors.js';
import type { UserDoc } from '../models/index.js';
import { findOrCreateUser } from '../services/users.js';
import type { TokenVerifier } from './firebase.js';

export interface AuthOptions {
  verifyToken: TokenVerifier;
  allowedEmailDomain: string;
  requireVerifiedEmail: boolean;
}

export function currentUser(res: Response): UserDoc | undefined {
  return res.locals.user as UserDoc | undefined;
}

export function authenticate(opts: AuthOptions): RequestHandler {
  const suffix = '@' + opts.allowedEmailDomain.toLowerCase();
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header) return next();

    const match = /^Bearer\s+(.+)$/i.exec(header);
    const idToken = match?.[1];
    if (!idToken) throw new HttpError(401, 'invalid_token', 'The Authorization header must be "Bearer <token>".');

    let token;
    try {
      token = await opts.verifyToken(idToken);
    } catch {
      throw new HttpError(401, 'invalid_token', 'Your session expired. Sign in again.');
    }

    const email = token.email?.toLowerCase();
    if (!email || !email.endsWith(suffix)) {
      throw new HttpError(403, 'email_domain', `Sign in with your ${suffix} account.`);
    }
    if (opts.requireVerifiedEmail && !token.emailVerified) {
      throw new HttpError(403, 'email_unverified', 'Verify your email address, then sign in again.');
    }

    res.locals.user = await findOrCreateUser({ ...token, email });
    next();
  };
}

export const requireUser: RequestHandler = (_req, res, next) => {
  if (!currentUser(res)) throw unauthorized();
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    const user = currentUser(res);
    if (!user) throw unauthorized();
    if (!user.roles.some(r => roles.includes(r as Role))) throw forbidden();
    next();
  };
}
