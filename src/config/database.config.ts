import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs('database', (): TypeOrmModuleOptions => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Failing fast here beats TypeORM trying to open a Postgres connection
    // against a non-Postgres (e.g. Supabase https://) URL and failing with
    // a confusing driver error instead.
    throw new Error(
      'Missing DATABASE_URL environment variable (Supabase Dashboard → Settings → Database → Connection string → URI).',
    );
  }

  return {
    type: 'postgres',
    url,
    autoLoadEntities: true,
    // Schema auto-sync is OFF unless DB_SYNCHRONIZE=true.
    // The admin Product entity maps to the same `products` table the catalog
    // reads through Supabase, so letting TypeORM alter it could drop columns.
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    ssl: { rejectUnauthorized: false }, // required for Supabase
    logging: process.env.NODE_ENV === 'development',
  };
});
