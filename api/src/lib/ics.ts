const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 73) {
    let cut = 73;
    while (Buffer.byteLength(rest.slice(0, cut)) > 73) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export interface IcsEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  url: string;
}

export function toIcs(e: IcsEvent, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Illi-Knows//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@illi-knows`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${escapeText(e.title)}`,
    `DESCRIPTION:${escapeText(`${e.description}\n\n${e.url}`.trim())}`,
    `LOCATION:${escapeText(e.location)}`,
    `URL:${e.url}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
