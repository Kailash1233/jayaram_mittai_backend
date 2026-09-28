/**
 * Seed Script — Create First Admin User
 *
 * Usage (open a NEW terminal, don't stop the running server):
 *   npm run seed:admin
 *
 * This script creates the very first admin account in the database.
 * It is safe to run multiple times — it will skip creation if the
 * email already exists.
 *
 * Credentials (change before running if you want different values):
 *   Email    : admin@jayarammittai.com
 *   Password : Admin@123
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

// ── Credentials (edit these if you want different values) ─────────────────────

const ADMIN_EMAIL = 'admin@jayarammittai.com';
const ADMIN_PASSWORD = 'Admin@123';

// ── Database connection (mirrors your app.module.ts Supabase setup) ───────────

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase pooler
  synchronize: false,                 // never auto-migrate in seed scripts
  logging: false,
});

// ── Seed logic ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  Connecting to Supabase database…');
  await AppDataSource.initialize();

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Check if admin already exists to avoid duplicate errors
    const existing = await queryRunner.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [ADMIN_EMAIL],
    );

    if (existing.length > 0) {
      console.log(`⚠️   Admin already exists: ${ADMIN_EMAIL} — skipping.\n`);
      return;
    }

    // Hash password using bcryptjs (same as auth.service.ts → bcrypt.hash())
    console.log('🔐  Hashing password with bcrypt…');
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    // Insert admin user (column names match user.entity.ts exactly)
    await queryRunner.query(
      `INSERT INTO users (email, "hashedPassword", role, "hashedRefreshToken")
       VALUES ($1, $2, 'admin', NULL)`,
      [ADMIN_EMAIL, hashedPassword],
    );

    console.log('\n✅  Admin user created successfully!\n');
    console.log('┌─────────────────────────────────────────────┐');
    console.log('│  Email    : ' + ADMIN_EMAIL.padEnd(32) + '│');
    console.log('│  Password : ' + ADMIN_PASSWORD.padEnd(32) + '│');
    console.log('└─────────────────────────────────────────────┘\n');
    console.log('   Login at  → POST http://localhost:3000/admin/auth/login');
    console.log('   Products  → POST http://localhost:3000/admin/products\n');
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
    console.log('🔌  Database connection closed.\n');
  }
}

seed().catch((err: Error) => {
  console.error('\n❌  Seed failed:', err.message, '\n');
  process.exit(1);
});
