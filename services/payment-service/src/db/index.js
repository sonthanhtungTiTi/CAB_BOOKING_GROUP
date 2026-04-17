const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'cab_user',
  password: process.env.POSTGRES_PASSWORD || 'cab_secret_2024',
  database: 'cab_payment_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('[PaymentDB] Connected to cab_payment_db');
});

pool.on('error', (err) => {
  console.error('[PaymentDB] Error:', err.message);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id     UUID NOT NULL,
        customer_id    UUID NOT NULL,
        amount         DECIMAL(10, 2) NOT NULL,
        currency       VARCHAR(10) NOT NULL DEFAULT 'VND',
        payment_method VARCHAR(50) NOT NULL,
        status         VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    console.log('[PaymentDB] payments table is ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
