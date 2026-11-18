# Illi-Knows

A campus events platform. Students discover events on a list, a week grid, or a campus map, RSVP (publicly or anonymously), and keep a planner. Organizers post events and track RSVPs and check-ins. Admins review every listing before it goes live.

This is a student class project. It isn't affiliated with or endorsed by the University of Illinois.

## Design reference

[`mock/illi-knows-ikd.html`](mock/illi-knows-ikd.html) is the approved clickable mock (version IKD). Open it in a browser. It is the source of truth for layout, copy, colors, and behavior. Every event, person, and number in it is made up.

Use the **View as** menu in the header to switch between:

| View | Lands on | What it covers |
|---|---|---|
| Landing page | Landing | Guest browsing, sign-in card, this-week map, categories |
| Denise, student | Home | Discover (List / Week / Map), event pages, RSVP, anonymous RSVP, reminders, planner with route map |
| Tim, organizer | Manage events | Event table, events on the map, create/edit dialog, Insights charts |
| Alex, admin | Review queue | Approve / request changes / reject, List / Map toggle, listings that can't be mapped |

### Rules to keep when building from the mock

- **Accounts are optional for browsing.** Guests can see Discover, event pages, and the map. RSVP, add to calendar, reminders, and posting events open a sign-in prompt, then finish the action after sign-in.
- **Anonymous RSVP** counts toward the going total, but the person's name stays off the attendee list. Hosts see only a number. The person can switch it on or off later.
- **The campus map** is a custom SVG (not Google Maps). Buildings are fixed shapes, events are pinned by building, pins are numbered to match the list next to the map, and selecting a pin opens a preview. Events without a known building are listed as "Not on the map."
- **Every listing is reviewed** by an admin before anyone else can see it. New and edited organizer events go back to review.

### Brand (University of Illinois guidelines)

- **Colors:** Illini Orange `#FF5F05` and Illini Blue `#13294B` should cover about 80% of the color. The only neutrals allowed are White, Storm `#707372`, Storm 60 `#8E9090`, and Storm 80 `#C6C7C6`. Supporting colors (Industrial `#1D58A7`, Prairie `#006230`, Harvest `#FCB316`, Berry `#5C0E41`) are only for the map, charts, and status labels. Don't use tints of the main colors.
- **Contrast:** text on orange is always Illini Blue, never white.
- **Charts** use Illini Blue for the main series and Illini Orange for the second.
- **Type:** Montserrat for headings and big numbers, Source Sans 3 for everything else.
- **Superfly** (a licensed brush script) is used for exactly one white word per hero headline, never in all caps. The mock falls back to Kaushan Script when Superfly isn't installed.
- University web fonts may only be hosted on `*.illinois.edu`. Outside that domain, bundle the open-source Montserrat and Source Sans 3 files with the app instead of loading them from the brand CDN.
