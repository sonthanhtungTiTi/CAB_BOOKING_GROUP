const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'cab_user',
  password: process.env.POSTGRES_PASSWORD || 'cab_secret_2024',
  database: 'cab_booking_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('[BookingDB] Connected to cab_booking_db');
});

pool.on('error', (err) => {
  console.error('[BookingDB] Error:', err.message);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id      UUID NOT NULL,
        pickup_lat       DECIMAL(10, 7) NOT NULL,
        pickup_lng       DECIMAL(10, 7) NOT NULL,
        destination_lat  DECIMAL(10, 7) NOT NULL,
        destination_lng  DECIMAL(10, 7) NOT NULL,
        status           VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        driver_id        UUID,
        idempotency_key  VARCHAR(255) UNIQUE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings (customer_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
    `);

    // ─── TC38: Outbox Events table (Outbox Pattern) ──────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox_events (
        id          BIGSERIAL PRIMARY KEY,
        topic       VARCHAR(100) NOT NULL,
        payload     JSONB NOT NULL,
        processed   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON outbox_events (processed) WHERE processed = FALSE;
    `);

    console.log('[BookingDB] bookings table is ready');
    console.log('[BookingDB] outbox_events table is ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
