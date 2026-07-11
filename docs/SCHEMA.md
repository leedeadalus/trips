# Trip ⇄ Flight data model

## Relationship

**One-to-many, via a nullable FK on the "many" side** (chosen over a join table
since a flight belongs to at most one trip in this domain):

```
trips.trips (1) ──────< trips.flights (N)
                trip_id
```

- `trips.flights.trip_id` — `integer`, **nullable**, `REFERENCES trips.trips(id) ON DELETE SET NULL`.
  - `NULL` means the flight is unassigned / independent of any trip.
  - Deleting a trip does **not** delete its flights — it just detaches them
    (`trip_id` reset to `NULL`), which is why the FK is a plain column with
    `ON DELETE SET NULL` rather than a cascade.
- `trips.trips` has no reference back to flights — the association is fully
  captured by the FK column on `flights`.
- Indexed on `flights.trip_id` (`flights_trip_id_index`, created in
  `migrations/1700000000002_create-flights.cjs`), so per-trip lookups and the
  join used for flight counts (below) hit an index rather than a seq scan.

If a true many-to-many need ever arises (e.g. one flight shared across
multiple trips), introduce a `trips.trip_flights (trip_id, flight_id)` join
table and migrate `flights.trip_id` data into it — that is a backward-
compatible additive migration, not a breaking change to this model.

## Tables

### `trips.trips`
| column | type | notes |
|---|---|---|
| id | serial PK | |
| name | varchar(200) not null | |
| description | text | |
| start_date | date | |
| end_date | date | `CHECK (end_date >= start_date)` when both set |
| created_at / updated_at | timestamptz not null, default now() | |

### `trips.flights`
| column | type | notes |
|---|---|---|
| id | serial PK | |
| trip_id | integer, nullable | FK → `trips.trips(id)`, `ON DELETE SET NULL` |
| flight_number | varchar(20) not null | |
| departure_airport / arrival_airport | varchar(3) not null | IATA codes |
| departure_datetime | timestamptz not null | |
| arrival_datetime | timestamptz | |
| airline, class, booking_reference, ticket_price, currency, notes | — | optional metadata |
| status | varchar(20) not null, default 'confirmed' | `CHECK` in `confirmed, not_flown, cancelled, completed` |
| created_at / updated_at | timestamptz not null, default now() | |

No new migration was required for this task — the schema above (from
`migrations/1700000000001_create-trips.cjs` and
`1700000000002_create-flights.cjs`) already supports every acceptance
criterion below. This doc formalizes it for downstream tasks (dashboards,
trip-detail flight picker).

## Supported queries (repository.ts)

- **All flights, independent of trip** — `listFlights()` / `listAllFlights()`
  (`src/repository.ts`): no `trip_id` filter applied; also supports
  `trip_id`/`status` filters, plus sort/pagination for the "All Flights"
  dashboard page.
- **All trips, with per-trip flight count (efficient, no N+1)** —
  `listTripsWithFlightCounts()` (`src/repository.ts`):

  ```sql
  SELECT t.*, COUNT(f.id)::int AS flight_count
  FROM trips.trips t
  LEFT JOIN trips.flights f ON f.trip_id = t.id
  GROUP BY t.id
  ORDER BY t.start_date NULLS LAST, t.id
  ```

  Single query, one LEFT JOIN + GROUP BY, uses the `flights_trip_id_index`
  index for the join — trips with zero flights are still returned
  (`flight_count = 0`) because of the LEFT JOIN.
- **A trip and its flights** — `getTrip(id)`: existing two-query helper
  (trip row + `WHERE trip_id = $1`), unchanged.
- **Attach/detach a flight** — `assignFlightToTrip(flightId, tripId | null)`:
  unchanged, sets/clears `trip_id`.

## Downstream task notes

- t_c3231a6f (All Trips dashboard w/ flight counts): call
  `listTripsWithFlightCounts()` instead of `listTrips()` and render the
  `flight_count` column — no new query needed.
- t_ed456045 (trip detail flight-selection UI): "select individual flights"
  and "select a date range" both map to `assignFlightToTrip(flightId, tripId)`
  calls — for a date range, first resolve candidate flights via
  `listFlights({})` filtered client/server-side by
  `departure_datetime BETWEEN start AND end`, then call
  `assignFlightToTrip` for each. No schema change needed for either mode.

## Data preservation

No migration was added/altered by this task, so existing trip/flight rows are
untouched. Verified against the live containerized DB: `trips.trips` has 5
rows, `trips.flights` has 20 rows, unchanged before/after this change.

## Airport reference data (code -> city / coordinates)

There is no `airports_reference` DB table in this repo. Airport reference
data (IATA code, display name, city, lat/lon) lives entirely in the static
TS module `src/airport-geo.ts` (`AIRPORT_LOCATIONS`), by deliberate design:
airport code/city/coordinate mappings are static reference data, so a live
DB table / migration / external API call would be unnecessary overhead for
what map rendering and city lookups need.

- **"What city is airport code X in?"** -- `getAirportCity(iataCode)` from
  `src/airport-geo.ts`. Returns the city string (e.g. `"New York"`) or
  `null` if the code isn't in the table.
- **Full location (city, name, lat, lon)** -- `getAirportLocation(iataCode)`,
  same module. Returns an `AirportLocation` (now including `city`) or
  `null`.
- Both lookups are case-insensitive on the IATA code.
- Do **not** add a second airport dataset (e.g. a Postgres
  `airports_reference` table) -- extend `AIRPORT_LOCATIONS` in
  `airport-geo.ts` instead when new codes show up in flight data.
