/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createSchema('trips', { ifNotExists: true });

  pgm.createTable(
    { schema: 'trips', name: 'trips' },
    {
      id: 'id',
      name: { type: 'varchar(200)', notNull: true },
      description: { type: 'text' },
      start_date: { type: 'date' },
      end_date: { type: 'date' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.addConstraint(
    { schema: 'trips', name: 'trips' },
    'trips_date_order_chk',
    'CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)'
  );
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'trips', name: 'trips' });
};
