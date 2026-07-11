/* eslint-disable camelcase */

exports.shorthands = undefined;

/**
 * Purely additive reference table: IATA code -> lat/long (+ name/country
 * for context). Does not touch trips.trips or trips.flights in any way.
 * Populated by scripts/seed-airports.mjs from the OurAirports open
 * dataset (see that script for source URL and idempotency notes).
 */
exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'trips', name: 'airports_reference' },
    {
      id: 'id',
      iata_code: { type: 'varchar(3)', notNull: true },
      name: { type: 'text' },
      country: { type: 'varchar(2)' },
      latitude: { type: 'double precision', notNull: true },
      longitude: { type: 'double precision', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.addConstraint({ schema: 'trips', name: 'airports_reference' }, 'airports_reference_iata_code_unique', {
    unique: 'iata_code',
  });
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'trips', name: 'airports_reference' });
};
