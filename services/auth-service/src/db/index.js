const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'cab_user',
  password: process.env.POSTGRES_PASSWORD || 'cab_secret_2024',
  database: process.env.POSTGRES_DB || 'cab_auth_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('[AuthDB] New client connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[AuthDB] Unexpected error on idle client:', err.message);
});

/**
 * Initialise the users table and the uuid-ossp extension.
 * Called once at service startup.
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('CUSTOMER', 'DRIVER', 'ADMIN');
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role          user_role NOT NULL DEFAULT 'CUSTOMER',
        is_active     BOOLEAN NOT NULL DEFAULT true,
        refresh_token VARCHAR(512),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    `);

    console.log('[AuthDB] Database initialised — users table ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
