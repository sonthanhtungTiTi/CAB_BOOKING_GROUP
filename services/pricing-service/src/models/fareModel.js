const { pool } = require('../db');

async function createFare({ bookingId, baseFare, distanceFare, totalAmount, currency = 'VND' }) {
  const { rows } = await pool.query(
    `INSERT INTO fares (booking_id, base_fare, distance_fare, total_amount, currency)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING *`,
    [bookingId, baseFare, distanceFare, totalAmount, currency]
  );
  
  if (!rows[0]) {
      // It implies a conflict occurred and we shouldn't insert duplicates. Returning the existing record.
      const existing = await pool.query('SELECT * FROM fares WHERE booking_id = $1', [bookingId]);
      return existing.rows[0];
  }
  
  return rows[0];
}

async function findByBookingId(bookingId) {
  const { rows } = await pool.query('SELECT * FROM fares WHERE booking_id = $1 LIMIT 1', [bookingId]);
  return rows[0] || null;
}

module.exports = {
  createFare,
  findByBookingId,
};
