# trips-app

Tracks flights and groups them into trips, with a CLI and an MCP server on top of a shared repository layer. Runs against its own isolated Postgres instance (Docker) — **does not touch** any pre-existing `travel` schema/database.

## Stack

- Node.js + TypeScript (ESM)
- `pg` (node-postgres) for DB access
- `node-pg-migrate` for git-committed schema migrations
- `commander` for the CLI
- `@modelcontextprotocol/sdk` for the MCP server (stdio transport)
- `zod` for input validation
- `vitest` for tests

## Database

This app owns a dedicated Postgres instance, started via Docker:

```bash
docker compose up -d
```

This starts a `postgres:16-alpine` container (`trips-postgres`) on port `5433`, with a persistent
named volume `trips_pgdata`. Schema/tables live under the `trips` schema inside a database
also named `trips` — fully separate from any other database/schema on the host or in other
containers.

Copy `.env.example` to `.env` and adjust `DATABASE_URL` if needed. If running the app from
another container on the same Docker host, put both containers on a shared user-defined
network (e.g. `docker network create trips-net`, then `docker network connect trips-net <container>`
for both) so the hostname `trips-postgres` resolves via Docker's embedded DNS.

## Setup

```bash
docker compose up -d postgres
docker compose run --rm migrate
```

## Migrations

Migrations live in `migrations/` and are committed to git. `node-pg-migrate` config is in
`.node-pg-migraterc.json` (targets the `trips` schema for both the migrated objects and the
`pgmigrations` bookkeeping table's search path via `PGSCHEMA`).

Migrations run inside a container (`migrate` service, profile `tools`), built from the same
image as `app`/`mcp`, connecting to the `postgres` service over the shared `trips-net` network
— no host Node/npx required:

```bash
docker compose run --rm migrate                    # apply all pending migrations (up)
docker compose run --rm migrate down                # roll back the most recent migration
docker compose run --rm migrate create <name>       # scaffold a new migration
```

Current migrations:
1. `1700000000001_create-trips.cjs` — creates the `trips` schema and `trips.trips` table.
2. `1700000000002_create-flights.cjs` — creates `trips.flights` (with `trip_id` FK, a `status`
   CHECK constraint restricting to `confirmed | not_flown | cancelled | completed`, and indexes
   on `trip_id`, `status`, `departure_datetime`).

## CLI

```bash
npm run cli -- trip create --name "Europe Spring 2026" --start 2026-03-18 --end 2026-05-29
npm run cli -- trip list
npm run cli -- trip show 1

npm run cli -- flight add --number UA70 --from EWR --to AMS \
  --departure 2026-03-18T18:35:00Z --airline "United Airlines" \
  --booking-ref H59RC5 --trip 1

npm run cli -- flight list
npm run cli -- flight list --status not_flown
npm run cli -- flight assign <flightId> <tripId>
npm run cli -- flight mark-not-flown <flightId>
npm run cli -- flight mark-flown <flightId>
npm run cli -- flight delete <flightId>
```

## HTTP API

Start the dashboard/API server in its container:

```bash
docker compose up -d dashboard
```

The examples below use `http://localhost:4173` as the base URL. Requests and responses
use JSON unless noted otherwise.

> **Security boundary:** The dashboard and HTTP API have no application-level
> authentication or authorization. Anyone who can reach the service can create flights,
> assign flights to trips, and read map data. Restrict access with deployment and network
> controls (for example, firewall rules, a private network, or an authenticating reverse
> proxy); do not expose the service directly to an untrusted network.

### `POST /flights`

Creates a flight. The request uses camelCase field names:

```bash
curl -i -X POST http://localhost:4173/flights \
  -H 'Content-Type: application/json' \
  -d '{
    "flightNumber": "UA70",
    "departureAirport": "EWR",
    "arrivalAirport": "AMS",
    "departureDatetime": "2026-03-18T18:35:00Z",
    "arrivalDatetime": "2026-03-19T07:15:00Z",
    "airline": "United Airlines",
    "flightClass": "economy",
    "bookingReference": "H59RC5",
    "ticketPrice": 725.50,
    "currency": "USD",
    "status": "confirmed",
    "notes": "Window seat",
    "tripId": 1
  }'
```

Required fields are `flightNumber`, `departureAirport` (exactly three characters),
`arrivalAirport` (exactly three characters), and `departureDatetime`. Optional `status`
values are `confirmed`, `not_flown`, `cancelled`, and `completed`; it defaults to
`confirmed`. All other fields shown above are optional.

Success returns `201 Created` and the created database record (snake_case fields):

```json
{
  "id": 21,
  "trip_id": 1,
  "flight_number": "UA70",
  "departure_airport": "EWR",
  "arrival_airport": "AMS",
  "departure_datetime": "2026-03-18T18:35:00.000Z",
  "arrival_datetime": "2026-03-19T07:15:00.000Z",
  "airline": "United Airlines",
  "class": "economy",
  "booking_reference": "H59RC5",
  "ticket_price": "725.50",
  "currency": "USD",
  "status": "confirmed",
  "notes": "Window seat",
  "created_at": "2026-02-01T12:00:00.000Z",
  "updated_at": "2026-02-01T12:00:00.000Z"
}
```

A syntactically valid JSON body that fails validation returns `400 Bad Request` with
field-level Zod issues. The issue details can include additional validation metadata:

```json
{
  "error": "Invalid request body",
  "issues": [
    {
      "code": "too_big",
      "path": ["departureAirport"],
      "message": "Too big: expected string to have <=3 characters"
    }
  ]
}
```

### `POST /trips/:id/flights`

Assigns existing flights to an existing trip. Send either an explicit non-empty list of
flight IDs:

```bash
curl -i -X POST http://localhost:4173/trips/1/flights \
  -H 'Content-Type: application/json' \
  -d '{"flightIds":[21,22]}'
```

or an inclusive departure-date range:

```bash
curl -i -X POST http://localhost:4173/trips/1/flights \
  -H 'Content-Type: application/json' \
  -d '{"startDate":"2026-03-18","endDate":"2026-03-31"}'
```

Success returns `200 OK`. `flights` contains the assigned records in the same snake_case
shape returned by `POST /flights`:

```json
{
  "tripId": 1,
  "assignedCount": 2,
  "flights": [
    {
      "id": 21,
      "trip_id": 1,
      "flight_number": "UA70",
      "departure_airport": "EWR",
      "arrival_airport": "AMS",
      "departure_datetime": "2026-03-18T18:35:00.000Z",
      "arrival_datetime": "2026-03-19T07:15:00.000Z",
      "airline": "United Airlines",
      "class": "economy",
      "booking_reference": "H59RC5",
      "ticket_price": "725.50",
      "currency": "USD",
      "status": "confirmed",
      "notes": "Window seat",
      "created_at": "2026-02-01T12:00:00.000Z",
      "updated_at": "2026-02-01T12:00:00.000Z"
    }
  ]
}
```

An invalid trip ID or request shape returns `400 Bad Request`, for example
`{"error":"Provide flightIds (array) or startDate/endDate (strings)"}`. A valid integer
ID for a trip that does not exist returns `404 Not Found` with
`{"error":"Trip 999 not found"}`.

### `GET /api/map-flights`

Returns flights for an inclusive date window, shaped for the dashboard map. Both query
parameters are required:

```bash
curl 'http://localhost:4173/api/map-flights?startDate=2026-03-01&endDate=2026-03-31'
```

Success returns `200 OK`:

```json
{
  "startDate": "2026-03-01",
  "endDate": "2026-03-31",
  "flights": [
    {
      "id": 21,
      "flightNumber": "UA70",
      "status": "confirmed",
      "departure": {
        "code": "EWR",
        "name": "Newark Liberty International Airport",
        "lat": 40.6895,
        "lon": -74.1745
      },
      "arrival": {
        "code": "AMS",
        "name": "Amsterdam Airport Schiphol",
        "lat": 52.3105,
        "lon": 4.7683
      }
    }
  ]
}
```

An airport missing from the location lookup is represented by `null` in the corresponding
`departure` or `arrival` field.
Missing query parameters return `400 Bad Request` with
`{"error":"startDate and endDate query params are required"}`. A reversed range
(`startDate > endDate`) is not an error: it returns `200 OK` with the requested dates and
an empty `flights` array.

The HTML dashboard route `GET /flights` remains separate from the JSON API: it returns
the rendered flights page, not JSON.

## MCP Server

```bash
npm run build
node dist/mcp/server.js
```

Or for local development without building: `npm run mcp` (runs via `tsx`).

### Registering with Hermes (containerized, project convention)

Per project convention this MCP server must run inside its container (via `docker compose run`),
not as a bare host `node` process. Register it with the Hermes CLI:

```bash
hermes mcp add trips-flights --command docker --args \
  compose -f /mnt/appdata/hermes/repos/trips-app/docker-compose.yml run --rm -T mcp
```

Notes:
- `--args` takes space-separated tokens (NOT a single comma/space-joined string) — Hermes execs
  `command` directly without a shell, so `--command "docker compose ... run --rm mcp"` as one string
  will fail with "Connection closed". Split it: `command: docker`, and put the rest in `--args`.
- The `-T` flag on `docker compose run` disables pseudo-TTY allocation, required for stdio-based
  MCP transport to work over the piped stdin/stdout.
- Verify with `hermes mcp test trips-flights` and `hermes mcp list`.
- Start a new Hermes session (`/reset`) after registering for the tools to become available.

Exposed tools: `list_trips`, `get_trip`, `create_trip`, `list_flights`, `create_flight`,
`assign_flight_to_trip`, `mark_flight_not_flown`, `mark_flight_flown`, `delete_flight`.

## Seed Data

`migrations/seed_real_data.sql` re-creates the real trips/flights from the original data
(5 trips, 20 flights, including the 3 genuinely `not_flown` bookings). It's a plain SQL
script, not a `node-pg-migrate` migration — running it truncates and reinserts, so it's
idempotent but destructive to any other data you've added by hand.

```bash
docker cp migrations/seed_real_data.sql trips-postgres:/tmp/seed_real_data.sql
docker exec trips-postgres psql -U trips -d trips -f /tmp/seed_real_data.sql
```

## Tests

Locally (against the containerized Postgres on `localhost:5433`):

```bash
npm test
```

Or fully inside a container (no host Node/npx needed), connected to the `postgres`
service over the shared `trips-net` network:

```bash
docker compose run --rm test
```

This builds the `test` target of the Dockerfile (same base image as `app`/`mcp`, plus
`tests/` and dev dependencies) and runs `npm test` (`vitest run`) inside the container.
