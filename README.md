# FLYINNYAN

Static build of the **Flyin Nyan** arcade game. Open `index.html` in a modern
browser to play. The project now ships with a lightweight leaderboard backend
design and a network-aware client that synchronises scores whenever an API
endpoint is available.

## Project structure

```
FLYINNYAN/
├── assets/
│   ├── background.png
│   ├── background1.png
│   ├── background2.png
│   ├── background3.png
│   ├── logo.png
│   ├── player.png
│   ├── powerbomb.png
│   ├── powerburger.png
│   ├── powerpizza.png
│   ├── villain1.png
│   ├── villain2.png
│   └── villain3.png
├── backend/
│   └── leaderboard-function.ts
├── manifest.webmanifest
├── index.html
├── service-worker.js
├── scripts/
│   └── app.js
├── styles/
│   └── main.css
└── README.md
```

Serve the project root with any static file server or use the VS Code Live
Server extension while editing. All required assets live inside the `assets`
directory and no extra font downloads are needed.

## Offline play & install prompts

`manifest.webmanifest` and `service-worker.js` turn the build into an installable
Progressive Web App. The service worker pre-caches core assets (sprites,
audio, fonts, UI chrome) during its first install so returning players can
launch the hangar without a network connection. When the cache is ready the
client sets `data-offline-ready="true"` on `<body>`—hook into this attribute if
you want to show bespoke UI copy for offline-ready devices.

Because the service worker skips waiting, shipping a new release is as simple as
redeploying the static files. Browsers automatically activate the new worker and
refresh cached assets on the next navigation. If you need to bust caches
manually, bump the `CACHE_VERSION` constant in `service-worker.js`.

## Remote leaderboard API

The game expects a simple REST service with two routes:

| Method | Path              | Description                                                |
| ------ | ----------------- | ---------------------------------------------------------- |
| `POST` | `/runs`           | Issue a short-lived signed run token for a device.         |
| `POST` | `/scores`         | Validate + record a submission, returning updated boards. |
| `GET`  | `/leaderboards`   | Return cached global/weekly standings.                     |

Requests are JSON and must include the player name, a stable `deviceId`,
score metadata, a millisecond `recordedAt` timestamp, **and a valid run token**.
The client requests a token via `POST /runs` before each gameplay session and
attaches the returned `runToken` when submitting `/scores`. Tokens expire after
five minutes (configurable) and are invalidated immediately after a successful
submission. The POST handler returns HTTP `201` on success with:

```jsonc
{
  "placement": 3,
  "leaderboards": {
    "global": [
      { "player": "Ace", "score": 420000, "timeMs": 265000, "bestStreak": 9, "nyan": 18000, "recordedAt": 1714953600000 }
    ],
    "weekly": [ /* same shape as above */ ]
  },
  "fetchedAt": "2024-05-05T12:34:56.000Z"
}
```

Conflicts (for example when a device resubmits a weaker run) should respond
with HTTP `409` plus a message and the authoritative leaderboards.

The included Supabase Edge Function implementation lives in
`backend/leaderboard-function.ts`. It provides:

* JSON validation and sanitisation for names, numeric values, and timestamps.
* Run session handshakes backed by Deno KV with HMAC-signed tokens.
* Rate limiting (default: 12 writes per device/IP per minute) backed by Deno KV.
* Conflict resolution that only upgrades an existing device row when the
  submitted score or survival time improves.
* Global + rolling weekly leaderboards derived from a single `scores` table.

### Run session handshake

Each call to `POST /runs` expects a JSON body containing `{ "deviceId": "…" }`
and responds with:

```jsonc
{
  "runToken": "<tokenId>.<expiresAt>.<signature>",
  "expiresAt": 1715020800000
}
```

Tokens are stored in Deno KV under the `run-token` namespace alongside the
requesting device ID. The backend signs each token using an HMAC secret so the
client cannot forge submissions. When `/scores` verifies the signature and KV
record it deletes the entry, preventing token reuse. Expired or missing tokens
return HTTP `401` and prompt the client to fetch a fresh token before retrying.

### Database schema

Create a `scores` table inside Supabase/Postgres using the following DDL:

```sql
create table public.scores (
  id bigserial primary key,
  device_id text not null unique,
  player_name text not null,
  score integer not null,
  time_ms integer not null,
  best_streak integer default 0,
  nyan integer default 0,
  recorded_at timestamptz not null,
  week_start date not null,
  client_submission_id text,
  inserted_at timestamptz not null default timezone('utc', now())
);

create index scores_recorded_at_idx on public.scores (recorded_at desc);
create index scores_week_start_idx on public.scores (week_start desc);
```

Row Level Security should stay disabled for this table when accessed through a
Service Role key inside the Edge Function. If you prefer to enable RLS, add a
policy that allows the service role to perform `select/insert/update` on the
table.

### Deploying with Supabase

1. Install the Supabase CLI and sign in: `supabase login`.
2. Copy `backend/leaderboard-function.ts` into `supabase/functions/leaderboard/index.ts`.
3. Deploy the function: `supabase functions deploy leaderboard`.
4. Note the function URL and create a service secret using `supabase secrets set
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... RUN_TOKEN_SECRET=...` (optionally
   add `RUN_TOKEN_TTL_MS` to adjust the default 5 minute token lifetime).

If you do not want to host on Supabase, the same function logic can run on
Cloudflare Workers or Google Cloud Functions with minimal adjustments—replace
the Supabase client with your datastore of choice, and wire the handlers to the
platform’s routing API.

### Configuring the client

Expose the leaderboard base URL to the browser by setting the global
`window.NYAN_ESCAPE_API_BASE_URL` before `index.html` loads, or by adding a
`data-nyan-api-base` attribute to `<html>`/`<body>`. When the API is reachable
the overlay displays the latest standings; if the network call fails the game
falls back to a cached snapshot stored in `localStorage` and surfaces an offline
warning in the HUD.

Each submission now sends a deterministic `deviceId`, player name, score, streak
information, timestamps, and a run token issued before launch. The UI reports
errors (conflicts, rate limiting, authentication, offline storage) directly
inside the overlay and leaderboard status banner. Redeploy the client and server
updates together so the handshake stays in sync.
