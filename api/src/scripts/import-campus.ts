import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPUS_BOUNDS, MAP_HEIGHT, MAP_WIDTH, project, type CampusBasemap, type LonLat, type PlaceKind, type Point } from '@illi-knows/shared';

interface OsmNode {
  lat: number;
  lon: number;
}
interface OsmElement {
  type: 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmNode[];
  members?: { type: string; role: string; geometry?: OsmNode[] }[];
}

export interface CampusPlace {
  key: string;
  name: string;
  kind: PlaceKind;
  osmId: string;
  facilityNumber?: string;
  aliases: string[];
  center: LonLat;
  outline: LonLat[];
}

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const PLACES_OUT = resolve(repo, 'api/src/seed/campus-places.json');
const BASEMAP_OUT = resolve(repo, 'web/public/map/campus-basemap.json');
const OVERPASS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

const MANUAL_ALIASES: Record<string, string[]> = {
  'Illini Union': ['union', 'student union', 'the union'],
  'Activities and Recreation Center': ['arc', 'the arc', 'rec center', 'recreation center'],
  'Main Quad': ['quad', 'the quad', 'main quadrangle'],
  'Undergraduate Library': ['ugl', 'undergrad library'],
  'Krannert Center for the Performing Arts': ['krannert', 'kcpa', 'krannert center'],
  'Siebel Center for Computer Science': ['siebel', 'siebel center', 'scs'],
  'Grainger Engineering Library': ['grainger', 'grainger library'],
  'Business Instructional Facility': ['bif'],
  'Foellinger Auditorium': ['foellinger'],
  'Memorial Stadium': ['the stadium'],
  'State Farm Center': ['assembly hall'],
  'Campus Recreation Center East': ['cre', 'crce']
};

const b = CAMPUS_BOUNDS;
const bbox = `${b.south},${b.west},${b.north},${b.east}`;
const query = (body: string) => `[out:json][timeout:180];\n(\n${body}\n);\nout geom tags;`;
const QUERIES = [
  query(`way["building"](${bbox});\n  relation["building"]["type"="multipolygon"](${bbox});`),
  query(`way["highway"](${bbox});`),
  query(
    [
      `way["leisure"~"^(park|garden|pitch|stadium|track|playground|common)$"](${bbox});`,
      `relation["leisure"~"^(park|garden|common)$"](${bbox});`,
      `way["landuse"~"^(grass|recreation_ground|meadow|village_green)$"](${bbox});`,
      `way["natural"~"^(water|wood|scrub)$"](${bbox});`,
      `way["waterway"](${bbox});`,
      `way["place"="square"](${bbox});`
    ].join('\n  ')
  )
];

async function fetchOverpass(q: string): Promise<OsmElement[]> {
  for (let round = 0; round < 3; round++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'illi-knows-class-project' },
          body: new URLSearchParams({ data: q }),
          signal: AbortSignal.timeout(240_000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as { elements: OsmElement[] }).elements;
      } catch (err) {
        console.warn(`  ${new URL(url).host} failed (${(err as Error).message})`);
      }
    }
    await new Promise(r => setTimeout(r, 10_000 * (round + 1)));
  }
  throw new Error('Every Overpass server failed. Try again in a few minutes.');
}

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const MINOR = new Set(['service']);
const PATHS = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'steps']);

const toRing = (g: OsmNode[] = []): LonLat[] => g.map(n => [n.lon, n.lat]);

function keptIndices(points: Point[], tolerance: number): number[] {
  if (points.length < 3) return points.map((_, i) => i);
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = points[first]!;
    const [bx, by] = points[last]!;
    let maxD = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (maxD > sq && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.flatMap((_, i) => (keep[i] ? [i] : []));
}

const simplify = (points: Point[], tolerance: number): Point[] => keptIndices(points, tolerance).map(i => points[i]!);

const r1 = (n: number) => Math.round(n * 10) / 10;

function pathOf(ring: LonLat[], closed: boolean, tolerance: number): string {
  const pts = simplify(ring.map(project), tolerance);
  if (pts.length < 2) return '';
  return 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + (closed ? 'Z' : '');
}

function area(ring: Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j]![0] + ring[i]![0]) * (ring[j]![1] - ring[i]![1]);
  return Math.abs(a / 2);
}

function centroid(ring: LonLat[]): LonLat {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j]!;
    const [x1, y1] = ring[i]!;
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [x / (3 * a), y / (3 * a)];
}

const inBounds = ([lon, lat]: LonLat) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;

function classify(tags: Record<string, string>): PlaceKind | null {
  const name = tags.name ?? '';
  if (tags.building) {
    if (['dormitory', 'residential', 'apartments', 'house'].includes(tags.building) || /residence hall|apartments/i.test(name)) return 'residence';
    if (tags.amenity === 'library' || /library/i.test(name)) return 'library';
    if (['theatre', 'arts_centre', 'cinema', 'concert_hall'].includes(tags.amenity ?? '') || tags.building === 'stadium' || /auditorium|theat|performing arts|stadium|state farm center|huff hall/i.test(name)) return 'venue';
    if (tags.leisure === 'sports_centre' || /recreation|gym/i.test(name)) return 'recreation';
    return 'building';
  }
  if (/quad/i.test(name)) return 'quad';
  if (['pitch', 'track', 'stadium'].includes(tags.leisure ?? '') || tags.landuse === 'recreation_ground' || /field/i.test(name)) return 'field';
  if (tags.leisure || tags.landuse || tags.place === 'square') return 'green';
  return null;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function main() {
  console.log(`Querying OpenStreetMap for ${bbox}...`);
  const elements: OsmElement[] = [];
  for (const [i, q] of QUERIES.entries()) {
    console.log(`  part ${i + 1} of ${QUERIES.length}...`);
    elements.push(...(await fetchOverpass(q)));
  }
  console.log(`Received ${elements.length} map features`);

  const layers: Record<keyof CampusBasemap['layers'], string[]> = {
    green: [], fields: [], water: [], waterways: [], majorRoads: [], minorRoads: [], paths: [], buildings: []
  };
  const candidates: (CampusPlace & { size: number })[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const rings: LonLat[][] =
      el.type === 'way'
        ? [toRing(el.geometry)]
        : (el.members ?? []).filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry).map(m => toRing(m.geometry));
    if (!rings.length || rings.every(r => r.length < 2)) continue;

    const isArea = !!(tags.building || tags.leisure || tags.landuse || tags.natural || tags.place === 'square');
    if (tags.building) layers.buildings.push(...rings.map(r => pathOf(r, true, 0.35)));
    else if (tags.highway) {
      const target = MAJOR.has(tags.highway) ? layers.majorRoads : MINOR.has(tags.highway) ? layers.minorRoads : PATHS.has(tags.highway) ? layers.paths : null;
      if (target && tags.area !== 'yes') target.push(...rings.map(r => pathOf(r, false, 0.5)));
    } else if (tags.waterway) layers.waterways.push(...rings.map(r => pathOf(r, false, 0.5)));
    else if (tags.natural === 'water') layers.water.push(...rings.map(r => pathOf(r, true, 0.5)));
    else if (['pitch', 'track', 'stadium'].includes(tags.leisure ?? '') || tags.landuse === 'recreation_ground') layers.fields.push(...rings.map(r => pathOf(r, true, 0.5)));
    else if (isArea) layers.green.push(...rings.map(r => pathOf(r, true, 0.5)));

    const kind = classify(tags);
    if (!tags.name || !kind || !isArea) continue;
    const outline = rings.reduce((best, r) => (area(r.map(project)) > area(best.map(project)) ? r : best));
    if (outline.length < 4) continue;
    const center = centroid(outline);
    if (!inBounds(center)) continue;
    const kept = keptIndices(outline.map(project), 0.35);
    const simplified = kept.length >= 4 ? kept.map(i => outline[i]!) : outline;
    const extra = ['alt_name', 'short_name', 'official_name', 'old_name', 'loc_name']
      .flatMap(k => (tags[k] ?? '').split(';'))
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    candidates.push({
      key: slugify(tags.name),
      name: tags.name,
      kind,
      osmId: `${el.type}/${el.id}`,
      facilityNumber: tags.ref,
      aliases: [...new Set([tags.name.toLowerCase(), ...extra, ...(MANUAL_ALIASES[tags.name] ?? [])])],
      center: [Number(center[0].toFixed(6)), Number(center[1].toFixed(6))],
      outline: simplified.map(([lon, lat]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))] as LonLat),
      size: area(outline.map(project))
    });
  }

  const byKey = new Map<string, CampusPlace & { size: number }>();
  for (const c of candidates.sort((a, z) => z.size - a.size)) if (!byKey.has(c.key)) byKey.set(c.key, c);
  const places: CampusPlace[] = [...byKey.values()]
    .sort((a, z) => a.name.localeCompare(z.name))
    .map(({ size: _size, facilityNumber, ...p }) => (facilityNumber ? { ...p, facilityNumber } : p));

  const basemap: CampusBasemap = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    attribution: '© OpenStreetMap contributors',
    layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.filter(Boolean).join('')])) as CampusBasemap['layers']
  };

  mkdirSync(dirname(PLACES_OUT), { recursive: true });
  mkdirSync(dirname(BASEMAP_OUT), { recursive: true });
  writeFileSync(PLACES_OUT, JSON.stringify(places) + '\n');
  writeFileSync(BASEMAP_OUT, JSON.stringify(basemap));
  const kb = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`Wrote ${places.length} places (${kb(JSON.stringify(places))}) and the base map (${kb(JSON.stringify(basemap))})`);
  const kinds = places.reduce<Record<string, number>>((m, p) => ({ ...m, [p.kind]: (m[p.kind] ?? 0) + 1 }), {});
  console.log('Places by kind:', kinds);
}

await main();
