import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'https://sclwpjqdnliccjdinaui.supabase.co',
    autoLoadEntities: true,
    // Schema auto-sync is OFF unless DB_SYNCHRONIZE=true.
    // The admin Product entity maps to the same `products` table the catalog
    // reads through Supabase, so letting TypeORM alter it could drop columns.
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    ssl: { rejectUnauthorized: false }, // required for Supabase
    logging: process.env.NODE_ENV === 'development',
  }),
);
