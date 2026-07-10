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
npm install
cp .env.example .env   # adjust as needed
npm run migrate:up
```

## Migrations

Migrations live in `migrations/` and are committed to git. `node-pg-migrate` config is in
`.node-pg-migraterc.json` (targets the `trips` schema for both the migrated objects and the
`pgmigrations` bookkeeping table's search path via `PGSCHEMA`).

```bash
npm run migrate:up      # apply all pending migrations
npm run migrate:down    # roll back the most recent migration
npx node-pg-migrate create <name>   # scaffold a new migration
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

## MCP Server

```bash
npm run build
node dist/mcp/server.js
```

Or for local development without building: `npm run mcp` (runs via `tsx`).

Register with an MCP-capable client (stdio transport), e.g.:

```json
{
  "mcpServers": {
    "trips-flights": {
      "command": "node",
      "args": ["/mnt/appdata/hermes/repos/trips-app/dist/mcp/server.js"],
      "env": { "DATABASE_URL": "postgres://trips:trips_dev_password@trips-postgres:5432/trips" }
    }
  }
}
```

Exposed tools: `list_trips`, `get_trip`, `create_trip`, `list_flights`, `create_flight`,
`assign_flight_to_trip`, `mark_flight_not_flown`, `mark_flight_flown`, `delete_flight`.

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
