# Ingestion contract

How the Python extractor sends events to Illi-Knows. The extractor never writes to MongoDB. It posts listings to the API, and the API decides what happens to them.

## What the API does with each listing

1. **Checks it** against the format below. A bad listing is reported back and skipped; the rest of the batch still goes through.
2. **Matches the location** to a campus building by name or alias ("Union courtyard" → Illini Union, room "courtyard"). If nothing matches, the listing is flagged `location_missing` and shows under "Not on the map".
3. **Looks for duplicates**: a live or queued event starting within three hours with a similar title, or at the same building within an hour. A match is flagged `possible_duplicate` and names the other event.
4. **Puts it in the admin review queue.** Nothing from ingestion is public until an admin approves it.

Re-sending a listing with the same `externalId` from the same kind of source **updates** it while it's still waiting for review. Once an admin has approved or rejected it, re-sends are reported as `unchanged`, so a later sync never overwrites a reviewed event.

## Request

```
POST https://illi-knows-api.onrender.com/api/ingest/listings
X-Api-Key: <INGEST_API_KEY>
Content-Type: application/json
```

The key is the `INGEST_API_KEY` environment variable on Render (Dashboard → illi-knows-api → Environment). Keep it out of the repository: read it from an environment variable in the extractor. Locally, set the same variable in `api/.env` and post to `http://localhost:4000`.

Send at most **200 listings** per request and at most 2 MB.

```json
{
  "source": {
    "kind": "instagram",
    "name": "Acoustic Club",
    "handle": "@acousticclub"
  },
  "listings": [
    {
      "externalId": "C9x8Yb1LmQ2",
      "title": "Open mic night",
      "description": "Sign-ups at 6:45. Two songs each.",
      "category": "Music",
      "startsAt": "2026-12-04T19:00:00-06:00",
      "endsAt": "2026-12-04T21:00:00-06:00",
      "location": "Union courtyard",
      "hostName": "Acoustic Club",
      "price": { "isFree": true },
      "url": "https://www.instagram.com/p/C9x8Yb1LmQ2/",
      "dateFromImage": true
    }
  ]
}
```

### `source`

| Field | Required | Notes |
|---|---|---|
| `kind` | yes | `event_board`, `instagram`, or `word_of_mouth` |
| `name` | yes | Shown to reviewers: "Campus events calendar", "Acoustic Club" |
| `handle` | Instagram only | With or without `@`. Links the listing to a club with that Instagram handle |
| `url` | no | The calendar or profile URL |

Each source is created the first time it sends, then reused. Its last run (time and number of new listings) shows on the admin page.

### Each listing

| Field | Required | Notes |
|---|---|---|
| `externalId` | yes | Stable id from the source: the post shortcode, the calendar event's UID. Up to 200 characters |
| `title` | yes | Up to 120 characters |
| `description` | no | Up to 5,000 characters |
| `category` | yes | `Music`, `Food`, `Sports`, `Career`, or `Arts` |
| `startsAt` | yes | ISO 8601 **with an offset** (`-06:00` in winter, `-05:00` in summer, or `Z`). A time without an offset is rejected, because campus time changes with daylight saving |
| `endsAt` | no | Same format. Defaults to two hours after the start |
| `location` | no | As written in the source. Matched to a campus building when possible |
| `hostName` | no | Defaults to the source's name. Ignored when an Instagram handle matches a known club |
| `price` | no | `{ "isFree": false, "amountCents": 800, "note": "Pay at the door" }`. Defaults to free |
| `url` | no | Link back to the post or calendar entry |
| `dateFromImage` | no | `true` when the date was read from an image. Flags it for a second look |
| `maybeNotEvent` | no | `true` when the extractor isn't sure it's an event (a sublease post, a giveaway). Flags it |

## Response

`200 OK` whenever the batch was understood, even if some listings were invalid:

```json
{
  "source": { "id": "674a…", "name": "Acoustic Club" },
  "counts": { "created": 1, "updated": 0, "unchanged": 0, "invalid": 0 },
  "results": [
    { "externalId": "C9x8Yb1LmQ2", "result": "created", "eventId": "674b…", "flags": ["date_from_image"] }
  ]
}
```

`result` is one of:

- `created`: new listing, now in the review queue
- `updated`: the listing was already queued and has been replaced with this version
- `unchanged`: already approved or rejected, so it was left alone (`reason` says which)
- `invalid`: not saved. `errors` maps field names to messages

Flags you may see: `location_missing`, `possible_duplicate`, `date_from_image`, `not_an_event`, `other` (for example "Starts in the past").

### Errors for the whole request

| Status | `error.code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | The `source` is missing or wrong, or `listings` is empty or has more than 200 items |
| 401 | `bad_api_key` | Missing or wrong `X-Api-Key` |
| 413 | `payload_too_large` | Over 2 MB. Send smaller batches |
| 503 | `not_configured` | The server has no `INGEST_API_KEY` set |

## Python example

```python
import os
import requests

API = os.environ.get("ILLI_KNOWS_API", "https://illi-knows-api.onrender.com")
KEY = os.environ["INGEST_API_KEY"]

def send(source: dict, listings: list[dict]) -> dict:
    totals = {"created": 0, "updated": 0, "unchanged": 0, "invalid": 0}
    for i in range(0, len(listings), 200):
        res = requests.post(
            f"{API}/api/ingest/listings",
            json={"source": source, "listings": listings[i : i + 200]},
            headers={"X-Api-Key": KEY},
            timeout=90,  # the free Render server can take ~30 s to wake up
        )
        res.raise_for_status()
        body = res.json()
        for k, v in body["counts"].items():
            totals[k] += v
        for r in body["results"]:
            if r["result"] == "invalid":
                print("invalid", r["externalId"], r["errors"])
    return totals
```

Build `startsAt` with a time zone, for example `datetime(2026, 12, 4, 19, 0, tzinfo=ZoneInfo("America/Chicago")).isoformat()`.
