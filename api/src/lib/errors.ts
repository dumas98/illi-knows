export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const unauthorized = (message = 'Sign in to do that.') => new HttpError(401, 'auth_required', message);
export const forbidden = (message = "You don't have access to that.") => new HttpError(403, 'forbidden', message);
