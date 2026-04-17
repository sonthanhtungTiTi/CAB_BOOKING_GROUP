const { pool } = require('../db');

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    pickupLat: parseFloat(row.pickup_lat),
    pickupLng: parseFloat(row.pickup_lng),
    destinationLat: parseFloat(row.destination_lat),
    destinationLng: parseFloat(row.destination_lng),
    status: row.status,
    driverId: row.driver_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── TC31/TC32: Transactional Create with Outbox ─────────────
// BEGIN → INSERT bookings → INSERT outbox_events → COMMIT
// Nếu có lỗi → ROLLBACK (không có data rác)
async function createWithTransaction({ customerId, pickupLat, pickupLng, destLat, destLng, idempotencyKey, simulateDbError }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. INSERT booking
    const { rows } = await client.query(
      `INSERT INTO bookings (customer_id, pickup_lat, pickup_lng, destination_lat, destination_lng, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6)
       RETURNING *`,
      [customerId, pickupLat, pickupLng, destLat, destLng, idempotencyKey],
    );
    const booking = rowToBooking(rows[0]);

    // TC32: Simulate DB error BEFORE commit (for rollback testing)
    if (simulateDbError) {
      throw new Error('SIMULATED_DB_ERROR: Rollback triggered before COMMIT');
    }

    // 2. TC38: INSERT outbox event (same transaction — atomic)
    await client.query(
      `INSERT INTO outbox_events (topic, payload)
       VALUES ($1, $2)`,
      ['ride_events', JSON.stringify({
        event_type: 'ride_requested',
        ride_id: booking.id,
        user_id: customerId,
        pickup: { lat: booking.pickupLat, lng: booking.pickupLng },
        timestamp: new Date().toISOString(),
      })],
    );

    await client.query('COMMIT');
    console.log(`[BookingModel] TX COMMITTED: booking=${booking.id}`);
    return booking;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[BookingModel] TX ROLLED BACK: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Legacy create (non-transactional, kept for backward compat) ──
async function create({ customerId, pickupLat, pickupLng, destLat, destLng, idempotencyKey }) {
  const { rows } = await pool.query(
    `INSERT INTO bookings (customer_id, pickup_lat, pickup_lng, destination_lat, destination_lng, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6)
     RETURNING *`,
    [customerId, pickupLat, pickupLng, destLat, destLng, idempotencyKey],
  );
  return rowToBooking(rows[0]);
}

async function findByIdempotencyKey(key) {
  const { rows } = await pool.query(
    'SELECT * FROM bookings WHERE idempotency_key = $1 LIMIT 1',
    [key],
  );
  return rowToBooking(rows[0]);
}

async function findById(bookingId) {
  const { rows } = await pool.query(
    'SELECT * FROM bookings WHERE id = $1 LIMIT 1',
    [bookingId],
  );
  return rowToBooking(rows[0]);
}

async function updateStatus(bookingId, status, driverId = null) {
  const { rows } = await pool.query(
    `UPDATE bookings
     SET status = $1, driver_id = COALESCE($2, driver_id), updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, driverId, bookingId],
  );
  return rowToBooking(rows[0]);
}

async function findByCustomerId(customerId) {
  const { rows } = await pool.query(
    'SELECT * FROM bookings WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20',
    [customerId],
  );
  return rows.map(rowToBooking);
}

async function findCurrentByUserId(userId) {
  const activeStatuses = ['PENDING', 'REQUESTED', 'SEARCHING', 'ASSIGNED', 'PICKUP', 'IN_PROGRESS'];
  const { rows } = await pool.query(
    `SELECT * FROM bookings
     WHERE (customer_id = $1 OR driver_id = $1)
       AND status = ANY($2::text[])
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, activeStatuses],
  );
  return rowToBooking(rows[0]);
}

// ─── TC38: Outbox helpers ────────────────────────────────────
async function getUnprocessedOutboxEvents(limit = 10) {
  const { rows } = await pool.query(
    'SELECT * FROM outbox_events WHERE processed = FALSE ORDER BY id ASC LIMIT $1',
    [limit],
  );
  return rows;
}

async function markOutboxEventProcessed(eventId) {
  await pool.query(
    'UPDATE outbox_events SET processed = TRUE WHERE id = $1',
    [eventId],
  );
}

module.exports = {
  create,
  createWithTransaction,
  findById,
  findByIdempotencyKey,
  updateStatus,
  findByCustomerId,
  findCurrentByUserId,
  getUnprocessedOutboxEvents,
  markOutboxEventProcessed,
};
