import { CAMPUS_EMAIL_DOMAIN, DEMO_HEADER, type ApiErrorBody } from '@illi-knows/shared';
import { getDemoPersona } from './demo';
import { auth } from './firebase';

export const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field name → messages, when the API rejected a form. */
  readonly fields: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fields: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function canUseAccount(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@' + CAMPUS_EMAIL_DOMAIN);
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !canUseAccount(user.email)) {
    const persona = getDemoPersona();
    return persona ? { [DEMO_HEADER]: persona } : {};
  }
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(await authHeader()) };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', "Can't reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    const details = body?.error.details;
    const fields = details && typeof details === 'object' && !Array.isArray(details) ? (details as Record<string, string[]>) : {};
    throw new ApiError(res.status, body?.error.code ?? 'http_error', body?.error.message ?? `Request failed (${res.status}).`, fields);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
