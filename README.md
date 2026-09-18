# Flighttracker

A personal flight logbook: log every flight you've taken, with the carrier
and aircraft attached, search real airports by name or ICAO/IATA code, and
see your routes on a map. Written in TypeScript.

- Login with bcrypt-hashed passwords (`bcryptjs`, cost factor 12 by default)
- SQLite by default, but the database layer is written behind a driver
  interface (an abstract `Driver` class) so a different backend can be
  dropped in later without touching any route code
- Ships with ~40 common carriers, ~30 common aircraft types, and **4,747
  real-world airports** (ICAO code, name, coordinates - large and medium
  airports worldwide, from the public-domain OurAirports dataset) as shared
  defaults everyone gets on first run
- Carrier/aircraft/airport pickers on the flight form are debounced,
  search-as-you-type boxes instead of long dropdowns
- Anything you add yourself (a carrier, aircraft type, or airport not in
  the defaults) is private to your account; the shared defaults are visible
  to everyone but can't be edited or deleted by regular users
- Dashboard has three tabs: stats overview (including total distance flown,
  countries/airports visited, longest flight, total time in the air), a
  Leaflet map of your routes, and a recent-flights list
- Optional: look up a flight by number + date (via AeroDataBox) to
  auto-fill origin, destination, times, duration, carrier, and aircraft -
  disabled by default, needs a free API key (see below)
- Tracks departure/arrival time, flight duration, and diversions (the
  airport a flight actually landed at, if different from planned)
- Click your username in the top bar to get to `/account` - change your
  email or password there. Usernames can't be changed once registered.

## Quick start (no Docker)

```bash
pnpm install
cp .env.example .env    # then edit SESSION_SECRET at minimum
pnpm dev                 # runs src/server.ts directly via ts-node, with hot-ish restarts
```

Visit `http://localhost:3000`, register an account, and start logging flights.

For a production run, compile first:

```bash
pnpm build   # tsc -> dist/, copies schema/indexes/seed data alongside it
pnpm start    # runs the compiled dist/server.js
```

`pnpm typecheck` runs `tsc --noEmit` alone, useful in CI or a pre-commit hook.

(npm works too if you'd rather - swap `pnpm` for `npm run` in the commands
above, e.g. `npm run dev`. There's no `package-lock.json` checked in since
`pnpm-lock.yaml` is the canonical lockfile here, but npm will happily
generate its own on first install.)

## Quick start (Docker / homelab)

```bash
cp .env.example .env    # optional, only used for local reference
docker compose up -d --build
```

The Dockerfile is a two-stage build: the first stage compiles TypeScript
(with the build tools `better-sqlite3`/`sqlite3` need to compile their
native modules) and prunes devDependencies away; the final image just runs
the compiled `dist/server.js` with production dependencies, no compiler
toolchain. `docker compose` creates `./data/` on the host for the SQLite
file and session store, and serves the app on port 3000. Edit
`SESSION_SECRET` in `docker-compose.yml` before you expose this beyond
your own network.

## How the pieces fit together

```
src/server.ts                - Express app setup, sessions, mounts routes
src/db/driver.ts               - Abstract Driver class every backend must implement
src/db/sqliteDriver.ts          - The SQLite implementation (better-sqlite3)
src/db/index.ts                 - Factory: reads DB_DRIVER from .env, returns the right driver
src/db/schema.sql                - Table definitions (copied to dist/ on build)
src/db/indexes.sql                - Indexes, applied after schema + migrations (see below)
src/db/seed.ts                     - Seeds default carriers/aircraft/airports on first run
src/db/seeds/airports.json          - The bundled 4,747-airport default dataset
src/services/aerodatabox.ts          - Optional flight-number lookup (see below)
src/utils/geo.ts                      - Great-circle (haversine) distance math
src/utils/safeCompare.ts               - Timing-safe string comparison (CSRF tokens, invite code)
src/middleware/auth.ts                  - requireAuth / attachUser helpers
src/middleware/csrf.ts                   - CSRF token generation + verification
src/middleware/rateLimit.ts               - Login/register rate limiters
src/routes/                                - authRoutes, flightRoutes, carrierRoutes, aircraftRoutes, airportRoutes, accountRoutes
src/types/models.ts                      - Domain types (User, Carrier, Aircraft, Flight, Airport, ...)
src/types/express.d.ts                    - Augments Express's Request/SessionData with our fields
views/                                      - EJS templates (not compiled - read straight from disk)
public/js/autocomplete.js                    - Debounced search-select widget used on the flight form
public/js/flight-lookup.js                    - Wires up the flight-number lookup button
public/js/dashboard-map.js                     - Leaflet map init, lazy-loaded when the Map tab opens
public/js/tabs.js                               - Dashboard tab switching
public/vendor/leaflet/                           - Leaflet, vendored locally (no external CDN needed)
```

`views/` and `public/` live at the project root rather than under `src/`,
since they're not TypeScript - both the dev entrypoint (`src/server.ts`
via ts-node) and the compiled one (`dist/server.js`) resolve them the same
way (`path.join(__dirname, '..', 'views')`), because `src/` and `dist/`
sit at the same depth relative to the project root.

### Swapping the database later

Routes never touch SQL directly — they only call methods like
`db.createFlight(...)` or `db.listCarriers(userId)`, all typed against the
abstract `Driver` class in `src/db/driver.ts`. To add a new backend
(Postgres, MySQL, whatever):

1. Create `src/db/postgresDriver.ts` exporting a class that `extends Driver`
   and implements every abstract method.
2. Register it in the `DRIVERS` map in `src/db/index.ts`.
3. Set `DB_DRIVER=postgres` (and whatever connection env vars your new
   driver needs) in `.env`.

Nothing else changes — routes, views, and session handling are all
driver-agnostic, and TypeScript will tell you at compile time if your new
driver is missing a method.

## Ownership model: defaults vs. your own entries

Carriers, aircraft, and airports all share the same rule: a row with no
owner (`user_id IS NULL`) is a shared default — visible to every account,
but not editable or deletable through the UI. A row with an owner is
private to that user: they see it, can edit and delete it, nobody else
sees it at all (search, list pages, and the flight form autocomplete all
filter it out for other accounts).

There's no way to create a new *shared* default through the UI by design
— only the seed step (`src/db/seed.ts`, run once automatically when a
table is empty) inserts unowned rows. Anything a user adds themselves is
always private to them.

Practically:
- The Carriers and Aircraft pages show every default plus your own
  entries, with a badge marking which is which; edit/delete only appear
  on rows you own.
- The Airports page only ever lists airports *you've* added — the
  4,747 defaults are search-only (via the flight form or `/airports/search`),
  never dumped into a browsable list.
- A custom airport you add has no coordinates by default, so it works
  fine for logging flights but won't appear on the map or count toward
  distance stats — only airports with known coordinates do.

### If you're upgrading from a version without this

Carriers/aircraft tables from before this existed get a `user_id` column
added automatically (`ALTER TABLE ... ADD COLUMN`, run once at startup).
Since seeding never existed before this model did, every row already in
those tables at that point is unambiguously something a real user added
— so instead of leaving them ownerless (which would make them permanently
uneditable), they're backfilled to the first account in the `users` table.
For a single-user homelab instance that's exactly the right owner; for a
genuinely multi-user upgrade you'd want to double check afterward.

## Map and stats

The dashboard's Map tab draws every flight whose origin *and* destination
both resolve to an airport with known coordinates (straight lines, not
true great-circle curves - simple, and still reads fine for anything short
of a transcontinental route) using Leaflet, vendored locally under
`public/vendor/leaflet/` so the map library itself doesn't depend on an
external CDN. The map only initializes the first time you open that tab,
since Leaflet sizes itself incorrectly if built against a hidden
container.

**Tile provider:** basemap tiles come from Esri's ArcGIS Online
`World_Street_Map` service (`public/js/dashboard-map.js`) - free, no API
key or account needed. This app originally pointed at OpenStreetMap's own
`tile.openstreetmap.org`, which is the "obvious free option," but OSM
tightened enforcement of their tile usage policy hard as of September
2026 and now blocks third-party apps outright (a wall of "403 Access
blocked" tiles, unrelated to any request header) regardless of how little
traffic they generate - this hit a wide range of unrelated hobby and
commercial projects the same week, not something specific to this app.
Esri's basemap is the standard free fallback people are switching to for
exactly this reason, but it's still someone else's free tier, not a
commitment - if it also gets locked down later, the durable fix is
self-hosting a basemap (e.g. a [Protomaps](https://protomaps.com/) PMTiles
file served from this same app, rendered with `protomaps-leaflet`), which
removes the dependency on any third party entirely. That's a bigger
change than swapping a URL, so it isn't done by default here.

The Overview tab's distance/countries/airports stats are computed the same
way - only over flights with recognized airports on both ends. If you've
free-typed an airport code that isn't in the dataset (and haven't added it
as a custom one), that flight still shows up everywhere else but won't
count toward these specific numbers; the dashboard says as much when it
applies.

## Flight time and diversions

Every flight can optionally record: local departure/arrival time, total
flight duration (hours + minutes), and a "diverted to" airport - for when
a flight didn't actually land where it was scheduled to.

- The Overview tab's "Time in the air" stat sums `duration_minutes`
  across all flights that have it set, independent of whether the
  airports were recognized (unlike the distance stat).
- When a flight has a diversion, the map and every distance/route
  calculation use the diversion airport as the real endpoint, not the
  original destination - a Stockholm flight diverted to Amsterdam instead
  of London counts the Stockholm–Amsterdam distance, not
  Stockholm–London. The original planned destination is still stored and
  shown for reference; the flight list marks diverted rows with a badge,
  and the map draws them as a dashed red line instead of the usual blue.

## Looking up a flight by number + date

The flight form can optionally auto-fill origin, destination, times,
duration, carrier, and aircraft from just a flight number and date, via
[AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) (a
RapidAPI-hosted aviation data service). This is **disabled by default** -
the app works exactly the same without it, manual entry is always
available regardless.

To enable it:
1. Create a free RapidAPI account and subscribe to AeroDataBox's free
   "Basic" plan (600 API units / ~2,400 requests per month - no credit
   card needed, and comfortably enough for personal logging).
2. Copy your API key into `.env` as `AERODATABOX_API_KEY=...` (or into
   `docker-compose.yml`'s `AERODATABOX_API_KEY` if running via Docker).
3. Restart the app. A "Look up from flight number + date" button appears
   above those fields on the flight form; it's simply absent when no key
   is configured.

**Honesty about reliability:** this is someone else's free tier for data
that's genuinely non-trivial to get for free (flight-tracking companies
charge for exactly this). AeroDataBox describes itself as
"enthusiast-driven, best-effort" - expect solid coverage for ordinary
commercial routes, but don't expect every regional or historical flight to
resolve, and don't expect a matched carrier/aircraft every time (the
lookup does its own best-effort text match against your visible
carriers/aircraft; if nothing matches, it tells you the raw text so you
can search or add it yourself rather than silently guessing). A failed or
empty lookup just leaves the form as-is - fill it in manually.

**One more thing worth knowing:** `src/services/aerodatabox.ts` was
written from AeroDataBox's public documentation and third-party examples,
not a live-tested response - there's no way to get a working API key
without you signing up for one, so it's never actually been exercised
against the real API. The field paths it reads (`departure.airport.icao`,
`aircraft.model`, etc.) are AeroDataBox's documented shape as of when this
was written. If a real lookup comes back `found: true` with most fields
empty, that's the first place to check - the module's top comment says
exactly how to inspect the raw response and fix the field paths if they've
drifted.

## Data model

- **users** — username, optional email, bcrypt password hash
- **carriers** — airline name, IATA/ICAO code, notes, optional owner
- **aircraft** — manufacturer, model, optional registration/tail number,
  notes, optional owner
- **airports** — ICAO code (primary key), IATA code, name, municipality,
  country, continent, lat/lon, optional owner
- **flights** — belongs to one user; date, origin/destination (free-text,
  usually an ICAO code picked via search), flight number, seat, notes,
  departure/arrival time, duration in minutes, an optional diversion
  airport, and links to one carrier and one aircraft

## Sharing this beyond your own network

If this is only ever reachable from your LAN, none of this section matters
much. Once it's on a public URL (even just to a handful of friends), three
things matter:

1. **Set an invite code.** `INVITE_CODE` in `.env` - without it,
   registration is wide open to anyone who finds the URL. One shared code
   for everyone you invite, not a per-person account system; give it out
   to whoever you actually want signing up.
2. **Set `TRUST_PROXY=true`** if (as is typical) this sits behind a
   reverse proxy that terminates HTTPS - Caddy, Traefik, nginx, whatever
   you're already running for your other services. This is required for
   rate limiting to see each visitor's real IP instead of the proxy's
   (without it, every visitor shares one rate-limit bucket), and for the
   session cookie's `secure` flag to actually work. Leave it `false` if
   there's no reverse proxy in front - setting it `true` without one lets
   a client spoof its own IP and defeats rate limiting entirely.
3. Actually getting a public URL routed to this app (domain, reverse
   proxy config, Tailscale, whatever) is on you - that's infrastructure
   this app has no opinion about.

## Security notes

- Passwords are hashed with bcrypt via `bcryptjs`; nothing is ever stored
  in plaintext (verified during build — see the hash format `$2a$12$...`).
- Sessions are stored server-side in SQLite (`connect-sqlite3`), so
  restarting the app doesn't log everyone out.
- Login timing is constant whether the username exists or not, to avoid
  leaking which usernames are registered.
- Ownership checks happen at the query level (`WHERE ... AND user_id = ?`),
  not just by hiding UI elements - a crafted request to edit/delete
  someone else's row or a shared default silently matches zero rows rather
  than succeeding.
- Every state-changing form (login, register, logout, and every
  create/update/delete across flights/carriers/aircraft/airports) requires
  a per-session CSRF token (`src/middleware/csrf.ts`) - a synchronizer
  token pattern hand-rolled rather than pulling in `csurf` (deprecated,
  unmaintained). A request missing or with the wrong token gets a plain
  403, regardless of whether the session cookie itself is valid.
- `/login` and `/register` are both rate-limited (`src/middleware/rateLimit.ts`,
  via `express-rate-limit`): 10 login attempts and 5 registration attempts
  per 15 minutes, per IP. This is what actually protects the invite code
  from being brute-forced, not just password guessing.
- What's still **not** included: account lockout after repeated failures
  (rate limiting covers the same threat more simply), email verification,
  and password reset (there's no email sending in this app at all - if you
  forget your password, reset it directly in the SQLite file, or add a
  reset flow yourself).

## A note on the dev script

`npm run dev` uses `ts-node --transpile-only`, which skips type-checking
at runtime for fast restarts. Full type-checking still happens via
`npm run build` / `npm run typecheck` (and presumably your editor) - this
is the standard ts-node pattern for a dev server, not a gap in coverage.

## A note for pnpm users

`better-sqlite3` (the main DB driver) and `sqlite3` (a transitive
dependency of `connect-sqlite3`, used for the session store) both ship
native modules that need to be compiled on install. pnpm 10+ blocks
native build scripts by default for security, which without the
`pnpm-workspace.yaml` in this repo shows up as either an
`ERR_PNPM_IGNORED_BUILDS` error, or - if you approve only one of the two
packages via `pnpm approve-builds` - a runtime crash like "Could not
locate the bindings file" for whichever one you missed. The
`pnpm-workspace.yaml` file already allowlists both, so a plain
`pnpm install` should just work. If you ever add another native
dependency, you'll need to add it to `allowBuilds` there too (or run
`pnpm approve-builds` again, which writes to the same file).

## Environment variables

See `.env.example` for the full list: `DB_DRIVER`, `SQLITE_PATH`,
`SESSION_SECRET`, `PORT`, `BCRYPT_SALT_ROUNDS`, `INVITE_CODE` (optional),
`TRUST_PROXY` (optional, default false), `AERODATABOX_API_KEY` (optional).
