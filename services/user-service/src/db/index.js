const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
  user: process.env.POSTGRES_USER || 'cab_user',
  password: process.env.POSTGRES_PASSWORD || 'cab_secret_2024',
  database: 'cab_user_db', // Database riêng biệt cho user-service
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('[UserDB] Connected to cab_user_db');
});

pool.on('error', (err) => {
  console.error('[UserDB] Error:', err.message);
});

async function initDatabase() {
  const client = await pool.connect();
  try {
    // Đảm bảo DB được tạo đúng cấu trúc
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id    UUID PRIMARY KEY,     -- Gắn thẳng với UUID từ Auth Service
        name       VARCHAR(100),
        phone      VARCHAR(20),
        avatar     VARCHAR(255),
        rating     DECIMAL(3, 2) DEFAULT 5.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[UserDB] user_profiles table is ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
