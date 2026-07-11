# Flight Lookup API Integration — Planning Doc

Status: Proposed
Owner: trips-app
Related code: `src/repository.ts`, `src/schemas.ts`, `src/cli.ts`, `src/mcp/server.ts`,
`src/dashboard/server.ts`, `migrations/1700000000002_create-flights.cjs`

## 1. Problem Statement

Today the only way to record a flight is `trips-app flight add`, which requires the caller
(a human via CLI, or an LLM via the MCP tool `create_flight`) to already know and manually
type every field: flight number, both airport codes, departure/arrival timestamps (as full
ISO datetimes, not just a date), airline name, cabin class, etc. In practice almost none of
this is memorized — it lives in a booking confirmation email or an airline app — so entering
a flight means tabbing between that source and the CLI/dashboard, transcribing values by hand.
This is slow and error-prone in ways that matter downstream: a wrong departure timestamp
silently breaks the trip's date-ordering assumptions, a typo'd IATA code produces a flight
that looks fine in the table but is wrong, and there is currently no validation that a given
flight number actually exists or matches the airports/date entered.

A flight lookup API turns flight entry into: "type the flight number and date (or the route
and date), pick the matching result, confirm." The API supplies the airline, aircraft/route,
and (for real-time or near-term flights) actual/estimated departure and arrival times,
removing manual transcription for the fields that are the most tedious and highest-risk for
typos. Historical/far-past bookings (e.g. already-completed trips being backfilled) may not be
covered by any live-lookup API, so manual entry must remain a fully supported fallback, not be
removed.

## 2. Candidate APIs

| | AeroDataBox (RapidAPI) | AviationStack | FlightAware AeroAPI |
|---|---|---|---|
| **Auth** | RapidAPI key (`X-RapidAPI-Key` header) | API key as query param (`access_key`) | API key as header (`x-apikey`) |
| **Free tier** | Yes, via RapidAPI free tier (limited calls/month) | Yes, 100 requests/month, HTTP only (no HTTPS on free tier) | No free tier; paid plans start ~$5/mo pay-as-you-go, billed per query type |
| **Pricing model** | RapidAPI subscription tiers (per-month quota) or pay-per-call | Monthly subscription tiers ($0 / ~$50 / ~$150+) by call volume | Pay-as-you-go per endpoint call, or committed monthly plans; flight-number lookups are relatively cheap, historical data costs more |
| **Rate limits** | Tier-dependent, RapidAPI enforces per-second and per-month caps | Tier-dependent (free tier is the constraining case: 100/mo total) | Tier-dependent; PAYG has a soft per-second cap, enterprise plans raise it |
| **Lookup by flight number + date** | Yes — `FIDS`/flight endpoints accept flight number + date | Yes — `flights` endpoint filters by `flight_number` + `flight_date` | Yes — `/flights/{ident}` supports a date-scoped lookup |
| **Lookup by route + date** | Yes, via schedule/route endpoints | Partial — filter by `dep_iata`/`arr_iata`, less precise for a specific date | Yes — `/schedules/{date_start}/{date_end}` supports origin/destination |
| **Data coverage** | Strong global schedule + live coverage via multiple aggregated sources | Good global schedule coverage; real-time data reliability varies by carrier/region, some users report gaps | Best-in-class for US/exec-aviation live tracking; strong global schedule data; the most reliable for actual (not just scheduled) departure/arrival times |
| **Response includes** | Airline, aircraft type, scheduled + (where available) actual times, terminal/gate | Airline, aircraft, scheduled + estimated times, status | Airline, aircraft, scheduled/estimated/actual times, gate/terminal, delay reason (richest metadata) |
| **Notes** | Easiest to prototype with (RapidAPI dashboard, single key for many APIs) | Simplest, well-known, but free tier is HTTP-only which is a non-starter for a server calling it from a container over the public internet without extra care | Highest quality/coverage but the highest cost floor; best fit once we have real usage and can justify the paid tier |

Recommendation: start with **AeroDataBox** for the MVP (generous enough free tier to build
and dogfood against, single RapidAPI key, decent global coverage for schedule-level lookups)
and design the backend integration behind an internal interface so we can swap in
**FlightAware AeroAPI** later without touching the CLI/MCP/dashboard layers, if we need better
live-tracking accuracy for near-term flights. AviationStack is a fallback option if AeroDataBox
coverage proves weak for a specific region, but its 100-req/month free tier makes it
impractical to rely on alone.

## 3. Proposed Architecture

**The lookup call happens server-side, never from the browser or MCP client directly.**
Reasons: (a) the provider API key must not be shipped to any client (dashboard is
server-rendered HTML already, so there is no "client" bundle to leak from, but the CLI/MCP
process itself is the trust boundary and should own the key, not each caller); (b) a backend
proxy lets us cache and rate-limit centrally regardless of which entry point (CLI, MCP tool,
dashboard) triggered the lookup; (c) it gives us one place to normalize differing provider
response shapes into the app's internal `FlightLookupResult` shape.

Concretely:

- New module `src/flightLookup/` :
  - `provider.ts` — a small interface: `searchByFlightNumber(flightNumber, date): Promise<FlightLookupResult[]>` and `searchByRoute(departureAirport, arrivalAirport, date): Promise<FlightLookupResult[]>`.
  - `providers/aeroDataBox.ts` — concrete implementation calling AeroDataBox, mapping its response into `FlightLookupResult`.
  - `cache.ts` — a thin cache wrapper (see below).
  - `index.ts` — exports a configured provider instance (picks provider from env var `FLIGHT_LOOKUP_PROVIDER`, defaults to `aerodatabox`), so adding FlightAware later is a new file + one line of config, not a rewrite.
- The dashboard server (`src/dashboard/server.ts`) gets a new route, e.g. `GET /flights/lookup?flightNumber=UA70&date=2026-03-18`, that calls the provider and returns JSON (consumed by a small bit of vanilla JS in the "add flight" page — no new frontend framework needed given the app is server-rendered HTML today).
- The MCP server (`src/mcp/server.ts`) gets a new tool, `lookup_flight`, taking the same params, so an LLM-driven flow can look up and then call `create_flight` in two tool calls without the human re-typing anything.
- The CLI gets a new subcommand, `flight lookup --number UA70 --date 2026-03-18`, printing candidate matches as a table, primarily useful for scripting/debugging.

**Caching.** Flight schedule data for a specific flight-number + date is essentially immutable
once the flight has flown, and changes slowly (delays aside) beforehand. Cache lookup
results keyed by `(provider, flightNumber|route, date)`:
- MVP: an in-process `Map` with a TTL (e.g. 15 minutes for lookups on today's date or the
  near future, 24 hours for dates more than 2 days out, since near-term schedules are the ones
  most likely to shift). This is enough given trips-app is a single-instance, low-traffic
  internal tool — no need for Redis yet.
  - Note the process already restarts per `docker compose run` for CLI/MCP invocations, so an
    in-process cache only really pays off for the long-lived dashboard server process; that is
    fine, CLI/MCP lookups are inherently one-shot interactive calls.
- Enhancement (phase 2+): move the cache into Postgres (a `trips.flight_lookup_cache` table
  keyed the same way, with a `fetched_at` column) so the dashboard and any future
  additional-instance deployment share a cache and survive restarts, without adding a new
  infra dependency (no Redis).

**Errors and timeouts.**
- All provider calls get a hard timeout (e.g. 5s) via `AbortController` on the outbound
  `fetch`; a slow provider must never block the request indefinitely.
- On timeout, non-2xx response, rate-limit response (429), or a response that fails schema
  validation (see below), the lookup layer returns a typed `FlightLookupError` (`timeout`,
  `rate_limited`, `not_found`, `provider_error`) rather than throwing raw errors up to
  CLI/MCP/dashboard callers, so each surface can render/report failure consistently.
- The dashboard's lookup endpoint responds with a JSON error object and a non-500 status for
  expected cases (`not_found`, `rate_limited`) so the UI can show a friendly message ("No
  matching flight found — check the number and date, or enter details manually") and always
  degrade to the existing manual-entry form; a lookup failure must never block manual flight
  creation.
- Provider responses are validated against a `zod` schema (consistent with the rest of the
  app's `src/schemas.ts` conventions) before being trusted; a provider schema change becomes a
  loud validation error in logs, not silently-wrong data written to Postgres.
- The MCP `lookup_flight` tool returns a structured "no results" response rather than an error
  when nothing matches, since "no results" is an expected outcome an LLM caller should handle
  by falling back to asking the user for manual details.

## 4. Proposed UI Flow

Entry point: the existing "add flight" surface (currently CLI-only; this work also implies
adding a dashboard "Add Flight" form, which does not exist yet — see Data Model / Phase 1
below for scope).

1. User opens "Add Flight" (dashboard form, optionally scoped to a specific trip via
   `/trips/:id/flights/new`).
2. Two lookup modes, selectable via a small toggle at the top of the form:
   - **By flight number + date** (primary/default — matches how most people have the
     information, e.g. from a confirmation email: "UA70 on March 18").
   - **By route + date** (secondary — for cases where the user knows they're flying
     EWR→AMS on a given day but doesn't have the flight number handy).
3. User fills the 2-3 relevant fields and clicks "Search" (a small JS `fetch` call to
   `GET /flights/lookup?...`, no full page reload).
4. Results render as a list of candidate cards below the search fields: airline + flight
   number, route, scheduled departure/arrival times, aircraft type if available. If zero
   results, show the "not found, enter manually" message from section 3 and leave the manual
   fields open below.
5. User clicks a result. Clicking auto-fills the manual entry fields below it (flight number,
   departure/arrival airport, departure/arrival datetime, airline) — the fields stay visible
   and editable, they're just pre-populated, so the user can correct anything the API got
   wrong (e.g. cabin class and booking reference are never returned by lookup APIs and always
   require manual input; ticket price/currency likewise).
6. User optionally fills the remaining manual-only fields (class, booking reference, price,
   currency, notes, trip assignment) and submits the form, which posts to the existing
   `create_flight` repository call — the lookup step never itself writes to the database, it
   only pre-fills the same form that manual entry already uses. This keeps "manual entry"
   and "lookup-assisted entry" as one form/one code path downstream of the fill step, not two
   parallel entry mechanisms to maintain.
7. For the MCP/LLM flow: the LLM calls `lookup_flight`, presents candidates to the user in
   chat, then calls `create_flight` with the chosen candidate's fields plus anything the user
   adds (trip, price, etc.) — no dashboard interaction required for that path.

## 5. Data Model Changes

Minimal changes are needed since the MVP treats lookup as a pre-fill step, not a permanently
linked record. To retain provenance and support future enhancements (e.g. "refresh this
flight's live status"), add:

New migration `1700000000003_add-flight-lookup-fields.cjs` altering `trips.flights`:

```js
pgm.addColumns({ schema: 'trips', name: 'flights' }, {
  lookup_source: { type: 'varchar(30)' },        // e.g. 'aerodatabox' | null for manual entry
  lookup_external_id: { type: 'varchar(100)' },  // provider's identifier for this scheduled flight, if any
  lookup_raw: { type: 'jsonb' },                 // full raw provider response at time of creation, for debugging/audit
  lookup_fetched_at: { type: 'timestamptz' },     // when the lookup was performed
});
```

- All four columns are nullable — manually-entered flights simply leave them null, no backfill
  needed and no behavior change for existing rows (respects the project's existing rule of not
  mutating current data beyond additive, nullable columns).
- `lookup_raw` (jsonb) is deliberately kept even though the MVP UI only surfaces a subset of
  fields — it means a phase-2 feature (e.g. showing gate/terminal info, or a "recheck flight
  status" button) doesn't require a new provider call for historical flights, and gives a
  debugging trail if a lookup-assisted entry turns out wrong.
- No change to `schemas.ts`'s `CreateFlightInput` validation shape is strictly required; the
  four lookup columns are populated by the repository layer (`repository.ts`) as optional
  extra args to `createFlight`, defaulting to `undefined`/null when the flight is entered
  manually or the caller doesn't pass lookup metadata.
- No new cache table in phase 1 (see in-process cache in section 3); a `trips.flight_lookup_cache`
  table is deferred to phase 2+ if/when persistence across restarts becomes worth the schema
  churn.

## 6. Phased Implementation Plan

**Phase 1 — MVP**
1. Add migration `1700000000003_add-flight-lookup-fields.cjs` (section 5).
2. Build `src/flightLookup/` module with the `provider.ts` interface and a single
   `providers/aeroDataBox.ts` implementation, in-process TTL cache, typed errors, 5s timeout.
3. Add `lookup_flight` MCP tool.
4. Add CLI `flight lookup --number ... --date ...` (and/or `--from/--to/--date` for route mode).
5. Extend `repository.createFlight` to accept the four optional lookup-provenance fields.
6. Add a minimal dashboard "Add Flight" page (this does not exist yet) with the manual form
   only, wired to `create_flight`'s existing validation — this is a prerequisite for step 7
   and is useful on its own even before lookup ships.
7. Wire the lookup search UI (section 4) into the Add Flight page, calling the new
   `/flights/lookup` endpoint and populating the manual fields on selection.
8. Tests: unit tests for the AeroDataBox response mapper and cache TTL logic (mocking the
   provider's HTTP layer, consistent with existing `tests/repository.test.ts` conventions
   using vitest); no live calls to the real provider in CI.

**Phase 2 — Enhancements**
1. Add a second provider (FlightAware AeroAPI) behind the same interface; make provider
   selectable via `FLIGHT_LOOKUP_PROVIDER` env var per environment, and consider a
   "try provider A, fall back to provider B on error/no-results" strategy.
2. Move the cache into Postgres (`trips.flight_lookup_cache`) so it survives dashboard
   restarts and is shared across CLI/MCP/dashboard invocations.
3. Add a "refresh flight status" action on an existing flight's detail view, re-querying the
   provider using the stored `lookup_external_id`/`lookup_source` and updating `status`
   (e.g. auto-flip to `completed` after the scheduled arrival time has passed and the provider
   confirms it landed) and `lookup_raw`/`lookup_fetched_at`.
4. Surface richer lookup metadata in the UI once available (gate/terminal, delay reason,
   aircraft type) by reading from `lookup_raw` instead of new dedicated columns, until usage
   shows those fields are common enough to warrant promoting them to first-class columns.
5. Rate-limit the `/flights/lookup` dashboard endpoint (e.g. simple per-IP token bucket) since
   it's the one path that can be hit repeatedly by an impatient user and burn through a paid
   provider's quota faster than the CLI/MCP paths would.
