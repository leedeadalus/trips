#!/usr/bin/env node
/**
 * One-off seed script: loads IATA code -> lat/long (+ name/country) into
 * `trips.airports_reference` from the OurAirports open-data `airports.csv`
 * dataset (public domain, https://ourairports.com/data/).
 *
 * This is purely additive: it only ever inserts/updates rows in
 * `airports_reference` (via `ON CONFLICT (iata_code) DO UPDATE`, so it's
 * idempotent/safe to re-run without duplicating rows). It never touches
 * `trips.trips` or `trips.flights`.
 *
 * Rows with no IATA code (most heliports/small strips) are skipped, since
 * `airports_reference.iata_code` is the whole point of the table.
 *
 * Run inside the app container (per project containerization convention):
 *   docker compose run --rm seed-airports
 */

import { Pool } from 'pg';

const DATA_URL =
  process.env.AIRPORTS_CSV_URL ?? 'https://davidmegginson.github.io/ourairports-data/airports.csv';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://trips:trips_dev_password@localhost:5433/trips';
const schema = process.env.PGSCHEMA ?? 'trips';

/** Minimal RFC4180 CSV line parser (handles quoted fields with embedded commas). */
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

async function fetchCsvRows() {
  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to download airports.csv: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const lines = text.split('\n').filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const col = (name) => header.indexOf(name);
  const idx = {
    iata: col('iata_code'),
    name: col('name'),
    country: col('iso_country'),
    lat: col('latitude_deg'),
    lon: col('longitude_deg'),
  };
  if (idx.iata === -1 || idx.lat === -1 || idx.lon === -1) {
    throw new Error('Unexpected airports.csv header shape -- missing iata_code/latitude_deg/longitude_deg');
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const iataRaw = fields[idx.iata]?.trim();
    if (!iataRaw || iataRaw.length !== 3 || !/^[A-Za-z]{3}$/.test(iataRaw)) continue; // skip rows without a valid 3-letter IATA code

    const lat = Number(fields[idx.lat]);
    const lon = Number(fields[idx.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    rows.push({
      iata: iataRaw.toUpperCase(),
      name: fields[idx.name]?.trim() || null,
      country: fields[idx.country]?.trim() || null,
      lat,
      lon,
    });
  }
  return rows;
}

async function main() {
  console.log(`Downloading airports dataset from ${DATA_URL} ...`);
  const rows = await fetchCsvRows();
  console.log(`Parsed ${rows.length} airports with valid IATA codes.`);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(`SELECT 1 FROM ${schema}.airports_reference LIMIT 1`).catch(() => {
      throw new Error(
        `${schema}.airports_reference does not exist yet -- run the migration first ` +
          '(docker compose run --rm migrate)'
      );
    });

    let upserted = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        await client.query(
          `INSERT INTO ${schema}.airports_reference (iata_code, name, country, latitude, longitude, updated_at)
           VALUES ($1, $2, $3, $4, $5, now())
           ON CONFLICT (iata_code) DO UPDATE SET
             name = EXCLUDED.name,
             country = EXCLUDED.country,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             updated_at = now()`,
          [row.iata, row.name, row.country, row.lat, row.lon]
        );
        upserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log(`Upserted ${upserted} rows into ${schema}.airports_reference.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
