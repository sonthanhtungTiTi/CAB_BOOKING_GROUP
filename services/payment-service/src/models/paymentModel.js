const { pool } = require('../db');

function rowToPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    amount: parseFloat(row.amount),
    currency: row.currency,
    paymentMethod: row.payment_method,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function createPayment({ bookingId, customerId, amount, currency = 'VND', paymentMethod, status = 'PENDING' }) {
  const { rows } = await pool.query(
    `INSERT INTO payments (booking_id, customer_id, amount, currency, payment_method, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [bookingId, customerId, amount, currency, paymentMethod, status]
  );
  return rowToPayment(rows[0]);
}

module.exports = {
  createPayment,
};
