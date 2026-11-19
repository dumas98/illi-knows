# Build plan

## Stack

| Piece | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router 7, TanStack Query |
| API | Express 5, TypeScript, Mongoose 9, Zod for request validation |
| Shared | `shared/` workspace with enums and API types used by both |
| Database | MongoDB Atlas (free tier) |
| Auth | Firebase Authentication. The API verifies ID tokens with `firebase-admin` |
| Web hosting | Firebase Hosting |
| API hosting | Render web service |
| Ingestion | Python in `ingestion/`, built later. It only talks to the API |

## Decisions

- **Sign-in:** Google accounts limited to `illinois.edu`, plus email and password. The API only accepts verified `@illinois.edu` emails.
- **Roles live in MongoDB** (`users.roles`), not in Firebase custom claims.
- **Ingestion never writes to MongoDB.** It sends listings to `POST /api/ingest/listings` with an API key. The API matches buildings, checks for duplicates, adds review flags, and puts the listing in the review queue.
- **Reminder emails must work for the demo.** A scheduled job sends them through an email service.
- **Demo mode** keeps the mock's "View as" switcher, backed by three seeded test accounts. It is off in production.

## Sprints

| Sprint | Scope | Done when |
|---|---|---|
| 0 | Workspaces, TypeScript, ESLint, CI, models in TypeScript, env config | `npm run check` passes in CI |
| 1 | Seed script with a fake semester anchored to today | `npm run seed` fills a database the screens can use |
| 2 | Firebase auth middleware, `/api/me`, public events API, web shell with brand, sign-in, landing page | A guest can browse; a user can sign in |
| 3 | Discover List / Week / Map, event page, `<CampusMap>` | Matches the mock |
| 4 | RSVP, anonymous RSVP, calendar `.ics`, reminders, planner, route map | Student flow complete |
| 5 | Organizer: create/edit, Manage events map, Insights | Organizer flow complete |
| 6 | Admin review queue, sources, ingestion endpoint and contract | Admin flow complete; Python can plug in |
| 7 | Deploy (Firebase Hosting, Render, Atlas), reminder emails job | Live URL |
| 8 | Accessibility, mobile, tests, end-to-end run with the three personas | Ready to present |
