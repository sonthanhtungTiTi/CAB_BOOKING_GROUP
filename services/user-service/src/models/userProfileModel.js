const { pool } = require('../db');

function rowToProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    avatar: row.avatar,
    rating: row.rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findByUserId(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return rowToProfile(rows[0]);
}

async function createProfile({ userId }) {
  const { rows } = await pool.query(
    `INSERT INTO user_profiles (user_id) 
     VALUES ($1) 
     ON CONFLICT (user_id) DO NOTHING 
     RETURNING *`,
    [userId]
  );
  return rowToProfile(rows[0]);
}

module.exports = {
  findByUserId,
  createProfile,
};
