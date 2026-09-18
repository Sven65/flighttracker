# Flighttracker

Personal flight logbook — carriers, aircraft, airports, routes on a map,
stats. TypeScript, Express, SQLite.

## Setup

```bash
pnpm install
cp .env.example .env   # set SESSION_SECRET
pnpm dev
```

Open `http://localhost:3000` and register.

Production:
```bash
pnpm build
pnpm start
```

Docker:
```bash
docker compose up -d --build
```

npm works too (`npm run dev` etc.) — there's just no committed
`package-lock.json` since `pnpm-lock.yaml` is canonical here.

## Env vars

Full list in `.env.example`.

- `SESSION_SECRET` — required, long random string
- `INVITE_CODE` — set this before going public, or anyone can register
- `TRUST_PROXY` — `true` if running behind Caddy/Traefik/nginx (needed for
  rate limiting and secure cookies to work correctly)
- `AERODATABOX_API_KEY` — optional, enables the flight-number lookup
- `DB_DRIVER`, `SQLITE_PATH`, `PORT`, `BCRYPT_SALT_ROUNDS` — defaults are fine

## Sharing this beyond your LAN

1. Set `INVITE_CODE` — one shared code, gates registration.
2. Set `TRUST_PROXY=true` if you're behind a reverse proxy.
3. Actually routing a domain/Tailscale/whatever to it is on you.

## Structure

```
src/server.ts                  Express app, sessions, routes
src/db/driver.ts                 Abstract driver interface
src/db/sqliteDriver.ts            SQLite implementation
src/db/seed.ts                     Seeds default carriers/aircraft/airports
src/services/aerodatabox.ts         Flight-number lookup (optional)
src/middleware/csrf.ts                CSRF tokens
src/middleware/rateLimit.ts            Login/register rate limits
src/routes/                              One file per resource
views/                                     EJS templates
public/                                     JS, CSS, vendored Leaflet
```

To swap out SQLite: implement `Driver` (see `src/db/driver.ts`) in a new
file, register it in `db/index.ts`, set `DB_DRIVER`.

## Ownership: defaults vs. your own

Carriers, aircraft, and airports are either a shared default (no owner,
visible to everyone, not editable) or private to whoever added them.
There's no UI path to create a new default — only the seed step does
that, once, on an empty table.

- Carriers/Aircraft pages show defaults + your own, badged; edit/delete
  only work on your own.
- Airports page only lists airports *you* added. The 4,747 defaults are
  search-only, never browsable as a list.
- A custom airport has no coordinates unless you add them, so it won't
  show on the map or count toward distance stats.

Upgrading an older database: carriers/aircraft get a `user_id` column
added automatically and backfilled to the first account (seeding didn't
exist before this feature, so every pre-existing row was added by a real
user).

## Flight time & diversions

Flights can record departure/arrival time, duration, and a diversion
airport. If a flight was diverted, the map and distance stats use the
diversion airport as the endpoint, not the original destination.

## Flight-number lookup (optional)

Set `AERODATABOX_API_KEY` to add a "look up" button on the flight form
(via AeroDataBox on RapidAPI — free tier, no card needed, 600
requests/month). Leave it unset and nothing changes.

Coverage is best-effort — don't expect every regional flight to resolve.
`src/services/aerodatabox.ts` is written from AeroDataBox's docs, not
tested against a live key; if a lookup comes back "found" with mostly
empty fields, that file is where to check the field paths.

## Data model

`users`, `carriers`, `aircraft`, `airports`, `flights` — see
`src/db/schema.sql` for exact columns.

## Security

- Bcrypt passwords, constant-time login comparison.
- CSRF tokens on every form (`src/middleware/csrf.ts`, hand-rolled since
  `csurf` is deprecated).
- Login/register rate-limited: 10 / 5 attempts per 15 min per IP.
- Ownership checks are enforced in SQL (`WHERE user_id = ?`), not just
  hidden in the UI.
- Not included: email verification, password reset (no email sending at
  all — reset directly in the SQLite file if needed), account lockout.

## pnpm and native modules

`better-sqlite3` and `sqlite3` need native builds; pnpm blocks those by
default. `pnpm-workspace.yaml` already allowlists both. Add any new
native dependency there too, or `pnpm install` will fail with
`ERR_PNPM_IGNORED_BUILDS`.
