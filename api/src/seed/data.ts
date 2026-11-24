import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Category, FlagCode, PlaceKind, SourceKind } from '@illi-knows/shared';

export const FAKE_EMAIL_DOMAIN = 'example.edu';

export interface CampusPlaceSeed {
  key: string;
  name: string;
  kind: PlaceKind;
  osmId: string;
  facilityNumber?: string;
  aliases: string[];
  center: [number, number];
  outline: [number, number][];
}

export function loadCampusPlaces(): CampusPlaceSeed[] {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), 'campus-places.json');
  return JSON.parse(readFileSync(file, 'utf8')) as CampusPlaceSeed[];
}

export interface OrgSeed {
  slug: string;
  name: string;
  kind: 'club' | 'department' | 'office';
  instagram?: string;
}

export const ORGS: OrgSeed[] = [
  { slug: 'acoustic-club', name: 'Acoustic Club', kind: 'club', instagram: 'acousticclub' },
  { slug: 'campus-radio', name: 'Campus Radio', kind: 'club', instagram: 'campusradio' },
  { slug: 'asian-student-association', name: 'Asian Student Association', kind: 'club', instagram: 'asa_campus' },
  { slug: 'film-society', name: 'Film Society', kind: 'club', instagram: 'filmsoc' },
  { slug: 'print-club', name: 'Print Club', kind: 'club' },
  { slug: 'clay-collective', name: 'Clay Collective', kind: 'club' },
  { slug: 'outdoor-club', name: 'Outdoor Club', kind: 'club' },
  { slug: 'running-club', name: 'Running Club', kind: 'club' },
  { slug: 'founders-society', name: 'Founders Society', kind: 'club' },
  { slug: 'dance-collective', name: 'Dance Collective', kind: 'club', instagram: 'dancecollective' },
  { slug: 'chess-club', name: 'Chess Club', kind: 'club' },
  { slug: 'student-government', name: 'Student Government', kind: 'office', instagram: 'studentgov' },
  { slug: 'career-services', name: 'Career Services', kind: 'office' },
  { slug: 'campus-rec', name: 'Campus Rec', kind: 'department' },
  { slug: 'school-of-music', name: 'School of Music', kind: 'department' },
  { slug: 'sustainability-office', name: 'Sustainability Office', kind: 'office' },
  { slug: 'school-of-design', name: 'School of Design', kind: 'department' }
];

export interface EventTemplate {
  key: string;
  title: string;
  category: Category;
  place: string | null;
  detail?: string;
  org: string;
  hour: number;
  minute?: number;
  minutes: number;
  priceCents?: number;
  source: SourceKind;
  popularity: [number, number];
  description: string;
}

export const TEMPLATES: EventTemplate[] = [
  { key: 'open-mic', title: 'Open mic night', category: 'Music', place: 'illini-union', detail: 'Courtyard Cafe', org: 'acoustic-club', hour: 19, minutes: 90, source: 'instagram', popularity: [30, 60], description: 'Sign up at the door for a five-minute slot, or just come listen. Poets, comics, and first-timers are all welcome.' },
  { key: 'farmers-market', title: 'Farmers market', category: 'Food', place: 'main-quad', org: 'sustainability-office', hour: 9, minutes: 180, source: 'event_board', popularity: [80, 130], description: 'Local produce, bread, and coffee from twelve vendors. Bring a bag and your student ID for the discount table.' },
  { key: 'resume-review', title: 'Resume review drop-in', category: 'Career', place: 'business-instructional-facility', detail: 'Room 2019', org: 'career-services', hour: 14, minutes: 120, source: 'event_board', popularity: [20, 40], description: 'Bring a printed resume and get ten minutes of feedback from a career coach. No appointment needed.' },
  { key: 'volleyball', title: 'Intramural volleyball finals', category: 'Sports', place: 'activities-and-recreation-center', detail: 'Court 2', org: 'campus-rec', hour: 18, minute: 30, minutes: 120, source: 'event_board', popularity: [40, 80], description: 'The top two teams of the fall league play best of five. Free popcorn for the first fifty people.' },
  { key: 'dumplings', title: 'Dumpling-making night', category: 'Food', place: 'illini-union', detail: 'Room 314', org: 'asian-student-association', hour: 17, minute: 30, minutes: 120, priceCents: 500, source: 'instagram', popularity: [20, 35], description: 'Fold, steam, and eat. The fee covers ingredients, and vegetarian filling is available.' },
  { key: 'jazz', title: 'Jazz combo recital', category: 'Music', place: 'smith-memorial-hall', detail: 'Recital hall', org: 'school-of-music', hour: 15, minutes: 75, source: 'event_board', popularity: [35, 65], description: 'Three student combos play standards and two original charts. About seventy minutes with no intermission.' },
  { key: 'printmaking', title: 'Printmaking open studio', category: 'Arts', place: 'art-and-design-building', detail: 'Room 110', org: 'print-club', hour: 16, minutes: 120, source: 'word_of_mouth', popularity: [8, 18], description: 'Try linocut with borrowed tools and leave with a small print. Wear clothes that can take ink.' },
  { key: 'startup-fair', title: 'Startup career fair', category: 'Career', place: 'siebel-center-for-computer-science', detail: 'Atrium', org: 'founders-society', hour: 11, minutes: 240, source: 'event_board', popularity: [100, 140], description: 'Thirty early-stage companies hiring interns and new grads. Short conversations, no suits required.' },
  { key: 'pancakes', title: 'Late-night pancake study break', category: 'Food', place: 'funk-library', org: 'student-government', hour: 21, minute: 30, minutes: 120, source: 'instagram', popularity: [90, 140], description: 'Free pancakes until the batter runs out. Toppings bar, decaf, and quiet tables in the back.' },
  { key: 'climbing', title: 'Climbing wall social', category: 'Sports', place: 'activities-and-recreation-center', detail: 'Climbing wall', org: 'outdoor-club', hour: 19, minutes: 120, priceCents: 300, source: 'word_of_mouth', popularity: [15, 30], description: 'Beginner-friendly routes with belay partners provided. The fee covers shoe and harness rental.' },
  { key: 'film-showcase', title: 'Student film showcase', category: 'Arts', place: 'foellinger-auditorium', org: 'film-society', hour: 20, minutes: 120, source: 'instagram', popularity: [50, 90], description: 'Nine short films made this semester, followed by a talk with the directors.' },
  { key: 'fun-run', title: '5K fun run', category: 'Sports', place: 'south-quad', org: 'running-club', hour: 8, minutes: 60, source: 'event_board', popularity: [60, 110], description: 'A flat loop around the south fields at any pace. Walkers are welcome, with hot cider at the finish.' },
  { key: 'pottery', title: 'Pottery throwdown', category: 'Arts', place: 'art-and-design-building', detail: 'Ceramics studio', org: 'clay-collective', hour: 13, minutes: 120, source: 'word_of_mouth', popularity: [10, 25], description: 'Timed challenges on the wheel, judged by the room. Beginners get a head start.' },
  { key: 'mock-interviews', title: 'Mock interview night', category: 'Career', place: 'business-instructional-facility', detail: 'Room 1001', org: 'career-services', hour: 18, minutes: 120, source: 'event_board', popularity: [25, 45], description: 'Practice a behavioral interview with alumni volunteers and get written feedback before you leave.' },
  { key: 'salsa', title: 'Salsa lessons', category: 'Arts', place: 'illini-union', detail: 'Ballroom', org: 'dance-collective', hour: 20, minutes: 90, source: 'instagram', popularity: [30, 60], description: 'No partner or experience needed. Thirty minutes of basics, then open dancing until close.' },
  { key: 'chess-blitz', title: 'Blitz chess tournament', category: 'Sports', place: 'grainger-engineering-library', detail: 'Room 335', org: 'chess-club', hour: 18, minutes: 150, source: 'word_of_mouth', popularity: [12, 24], description: 'Five-minute games, Swiss pairings, and boards provided. Bring a clock if you have one.' },
  { key: 'food-trucks', title: 'Food truck Friday', category: 'Food', place: 'main-quad', org: 'student-government', hour: 11, minute: 30, minutes: 150, source: 'instagram', popularity: [70, 120], description: 'Six local trucks park on the quad for lunch. Bring cash for two of them.' },
  { key: 'design-critique', title: 'Open design critique', category: 'Arts', place: 'siebel-center-for-design', detail: 'Room 140', org: 'school-of-design', hour: 17, minutes: 90, source: 'event_board', popularity: [15, 30], description: 'Bring a poster, app, or portfolio piece and get feedback from design faculty and classmates.' },
  { key: 'sunset-yoga', title: 'Sunset yoga', category: 'Sports', place: 'main-quad', detail: 'North lawn', org: 'campus-rec', hour: 17, minutes: 60, source: 'event_board', popularity: [25, 50], description: 'An all-levels flow as the sun goes down. Mats are provided while they last.' },
  { key: 'hack-night', title: 'Hack night', category: 'Career', place: 'engineering-hall', detail: 'Room 1002', org: 'founders-society', hour: 19, minutes: 180, source: 'instagram', popularity: [30, 60], description: 'Work on side projects with other builders. Mentors walk around from 8 to 10, and dinner is on us.' },
  { key: 'karaoke', title: 'Karaoke night', category: 'Music', place: 'illini-union', detail: 'Basement lounge', org: 'campus-radio', hour: 20, minutes: 150, source: 'instagram', popularity: [40, 70], description: 'Over four thousand songs, two mics, and no judgment. Duets strongly encouraged.' },
  { key: 'movie-quad', title: 'Movie on the quad', category: 'Arts', place: 'main-quad', org: 'film-society', hour: 19, minute: 30, minutes: 120, source: 'instagram', popularity: [60, 110], description: 'A crowd favorite on the big inflatable screen. Bring a blanket; popcorn is free.' }
];

export interface QueueSeed {
  title: string;
  category: Category;
  dayOffset: number;
  hour: number;
  minute?: number;
  minutes: number;
  place: string | null;
  locationText: string;
  hostName: string;
  source: Exclude<SourceKind, 'organizer'>;
  handle?: string;
  flags: { code: FlagCode; message: string; relatedTo?: string }[];
  description: string;
}

export const REVIEW_QUEUE: QueueSeed[] = [
  { title: 'Free pizza and club fair', category: 'Food', dayOffset: 8, hour: 12, minutes: 120, place: null, locationText: '', hostName: 'Campus Life', source: 'instagram', handle: 'campus_life', flags: [{ code: 'location_missing', message: 'Location missing' }], description: 'Meet thirty clubs and grab a slice. Details in the post.' },
  { title: 'Open mic nite', category: 'Music', dayOffset: 2, hour: 19, minutes: 90, place: 'illini-union', locationText: 'Union courtyard', hostName: 'Acoustic Club', source: 'instagram', handle: 'acousticclub', flags: [{ code: 'possible_duplicate', message: 'Possible duplicate of Open mic night', relatedTo: 'open-mic' }], description: 'open mic this friday!! sign ups at 6:45' },
  { title: 'Yoga on the quad', category: 'Sports', dayOffset: 5, hour: 7, minute: 30, minutes: 60, place: 'main-quad', locationText: 'Main Quad, north lawn', hostName: 'Campus Rec', source: 'event_board', flags: [], description: 'Start the day with a gentle flow. Mats provided.' },
  { title: 'Apartment sublease for spring', category: 'Career', dayOffset: 1, hour: 9, minutes: 60, place: null, locationText: 'Off campus', hostName: 'Word of mouth', source: 'word_of_mouth', flags: [{ code: 'not_an_event', message: 'May not be an event' }], description: 'Two-bedroom sublease available January through May.' },
  { title: 'Guest lecture: Designing for trust', category: 'Arts', dayOffset: 6, hour: 17, minutes: 90, place: 'siebel-center-for-design', locationText: 'Siebel Center for Design 140', hostName: 'School of Design', source: 'event_board', flags: [{ code: 'date_from_image', message: 'Date was read from an image. Check it.' }], description: 'A visiting designer on building products people trust.' }
];
