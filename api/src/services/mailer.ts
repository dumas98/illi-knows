import type { Config } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

async function post(url: string, headers: Record<string, string>, body: unknown, provider: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (err) {
    throw new MailerError(`${provider} could not be reached: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new MailerError(`${provider} answered ${res.status}: ${detail}`, res.status);
  }
}

/** Brevo's transactional API. Works with a single verified sender address; no domain needed. */
export function brevoMailer(apiKey: string, from: { email: string; name: string }): Mailer {
  return {
    name: 'brevo',
    send: m =>
      post(
        'https://api.brevo.com/v3/smtp/email',
        { 'api-key': apiKey },
        { sender: from, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text },
        'Brevo'
      )
  };
}

/** Resend's API. Sending to people other than yourself needs a verified domain. */
export function resendMailer(apiKey: string, from: { email: string; name: string }): Mailer {
  return {
    name: 'resend',
    send: m =>
      post(
        'https://api.resend.com/emails',
        { Authorization: `Bearer ${apiKey}` },
        { from: `${from.name} <${from.email}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text },
        'Resend'
      )
  };
}

/** Development: prints the email instead of sending it. */
export function consoleMailer(log: (line: string) => void = console.log): Mailer {
  return {
    name: 'console',
    send: async m => log(`[email to ${m.to}] ${m.subject}`)
  };
}

export function mailerFromConfig(config: Pick<Config, 'EMAIL_PROVIDER' | 'EMAIL_API_KEY' | 'EMAIL_FROM' | 'EMAIL_FROM_NAME'>): Mailer {
  const from = { email: config.EMAIL_FROM ?? '', name: config.EMAIL_FROM_NAME };
  if (config.EMAIL_PROVIDER === 'brevo') return brevoMailer(config.EMAIL_API_KEY ?? '', from);
  if (config.EMAIL_PROVIDER === 'resend') return resendMailer(config.EMAIL_API_KEY ?? '', from);
  return consoleMailer();
}
