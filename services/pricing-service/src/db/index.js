const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'cab_user',
  password: process.env.POSTGRES_PASSWORD || 'cab_secret_2024',
  database: 'cab_pricing_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('[PricingDB] Connected to cab_pricing_db');
});

pool.on('error', (err) => {
  console.error('[PricingDB] Error:', err.message);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS fares (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id    UUID NOT NULL UNIQUE,
        base_fare     DECIMAL(10, 2) NOT NULL,
        distance_fare DECIMAL(10, 2) NOT NULL,
        total_amount  DECIMAL(10, 2) NOT NULL,
        currency      VARCHAR(10) NOT NULL DEFAULT 'VND',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('[PricingDB] fares table is ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
