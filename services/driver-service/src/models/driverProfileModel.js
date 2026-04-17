const { pool } = require('../db');

function rowToProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    licenseNumber: row.license_number,
    vehicleDetails: row.vehicle_details,
    status: row.status,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findByUserId(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM driver_profiles WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rowToProfile(rows[0]);
}

async function createProfile({ userId }) {
  const { rows } = await pool.query(
    `INSERT INTO driver_profiles (user_id) 
     VALUES ($1) 
     ON CONFLICT (user_id) DO NOTHING 
     RETURNING *`,
    [userId]
  );
  return rowToProfile(rows[0]);
}

async function updateStatus(userId, status) {
  const { rows } = await pool.query(
    `UPDATE driver_profiles SET status = $1, updated_at = NOW() WHERE user_id = $2 RETURNING *`,
    [status, userId],
  );
  return rowToProfile(rows[0]);
}

module.exports = {
  findByUserId,
  createProfile,
  updateStatus,
};
