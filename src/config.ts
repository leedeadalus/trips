import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://trips:trips_dev_password@localhost:5433/trips',
  schema: process.env.PGSCHEMA ?? 'trips',
};
