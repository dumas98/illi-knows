import { CAMPUS_TIMEZONE } from '@illi-knows/shared';
import type { EmailMessage } from './mailer.js';

export interface ReminderEmailInput {
  to: string;
  name: string;
  event: { id: string; title: string; startsAt: Date; endsAt: Date; locationText: string; hostName: string };
  webUrl: string;
  now: Date;
}

const tz = { timeZone: CAMPUS_TIMEZONE } as const;
const dayKey = new Intl.DateTimeFormat('en-CA', { ...tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const longDay = new Intl.DateTimeFormat('en-US', { ...tz, weekday: 'long', month: 'long', day: 'numeric' });
const time = new Intl.DateTimeFormat('en-US', { ...tz, hour: 'numeric', minute: '2-digit' });

const fmtTime = (d: Date) => time.format(d).replace(' AM', ' am').replace(' PM', ' pm');

/** "today at 7:00 pm", "tomorrow at 9:30 am", "Friday, December 4 at 7:00 pm" in campus time. */
export function whenPhrase(startsAt: Date, now: Date): string {
  const days = Math.round((Date.parse(dayKey.format(startsAt)) - Date.parse(dayKey.format(now))) / 86_400_000);
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : longDay.format(startsAt);
  return `${day} at ${fmtTime(startsAt)}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function reminderEmail({ to, name, event, webUrl, now }: ReminderEmailInput): EmailMessage {
  const when = whenPhrase(event.startsAt, now);
  const url = `${webUrl.replace(/\/$/, '')}/events/${event.id}`;
  const first = name.split(' ')[0] || 'there';
  const where = event.locationText || 'Location to be announced';
  const hours = `${longDay.format(event.startsAt)}, ${fmtTime(event.startsAt)} to ${fmtTime(event.endsAt)}`;
  const subject = `Reminder: ${event.title} is ${when}`;

  const text = [
    `Hi ${first},`,
    '',
    `${event.title} is ${when}.`,
    '',
    `When: ${hours}`,
    `Where: ${where}`,
    `Host: ${event.hostName}`,
    '',
    `Event page: ${url}`,
    '',
    "You're getting this because you set a reminder on Illi-Knows. To change or stop it, open the event page and pick a different reminder."
  ].join('\n');

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#707372;font-size:14px;vertical-align:top">${label}</td><td style="padding:4px 0;color:#13294B;font-size:15px">${esc(value)}</td></tr>`;

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#ffffff;font-family:'Source Sans 3','Segoe UI',Arial,sans-serif;color:#13294B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #C6C7C6;border-radius:14px;overflow:hidden">
<tr><td style="background:#13294B;padding:18px 24px;font-family:Montserrat,Arial,sans-serif;font-size:20px;font-weight:800;color:#ffffff">Illi-<span style="color:#FF5F05">Knows</span></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#707372">Reminder</p>
<h1 style="margin:0 0 8px;font-family:Montserrat,Arial,sans-serif;font-size:24px;line-height:1.2;color:#13294B">${esc(event.title)}</h1>
<p style="margin:0 0 18px;font-size:16px">Hi ${esc(first)}, this starts <strong>${esc(when)}</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px">${row('When', hours)}${row('Where', where)}${row('Host', event.hostName)}</table>
<a href="${esc(url)}" style="display:inline-block;background:#FF5F05;color:#13294B;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Open the event</a>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #C6C7C6;font-size:13px;color:#707372">You're getting this because you set a reminder on Illi-Knows. To change or stop it, open the event page and pick a different reminder. Illi-Knows is a student class project and isn't affiliated with the University of Illinois.</td></tr>
</table></td></tr></table></body></html>`;

  return { to, subject, html, text };
}
