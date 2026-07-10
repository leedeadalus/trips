/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'trips', name: 'flights' },
    {
      id: 'id',
      trip_id: {
        type: 'integer',
        references: { schema: 'trips', name: 'trips' },
        onDelete: 'SET NULL',
      },
      flight_number: { type: 'varchar(20)', notNull: true },
      departure_airport: { type: 'varchar(3)', notNull: true },
      arrival_airport: { type: 'varchar(3)', notNull: true },
      departure_datetime: { type: 'timestamptz', notNull: true },
      arrival_datetime: { type: 'timestamptz' },
      airline: { type: 'varchar(100)' },
      class: { type: 'varchar(50)' },
      booking_reference: { type: 'varchar(20)' },
      ticket_price: { type: 'numeric(10,2)' },
      currency: { type: 'varchar(3)' },
      status: { type: 'varchar(20)', notNull: true, default: 'confirmed' },
      notes: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.addConstraint({ schema: 'trips', name: 'flights' }, 'flights_status_chk', {
    check: "status IN ('confirmed', 'not_flown', 'cancelled', 'completed')",
  });

  pgm.createIndex({ schema: 'trips', name: 'flights' }, 'trip_id');
  pgm.createIndex({ schema: 'trips', name: 'flights' }, 'status');
  pgm.createIndex({ schema: 'trips', name: 'flights' }, 'departure_datetime');
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'trips', name: 'flights' });
};
