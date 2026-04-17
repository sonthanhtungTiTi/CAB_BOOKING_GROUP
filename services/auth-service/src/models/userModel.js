const { pool } = require('../db');

/**
 * User Model — raw SQL queries against the `users` table.
 *
 * Column mapping (DB snake_case → JS camelCase):
 *   id, email, password_hash→passwordHash, role, is_active→isActive,
 *   refresh_token→refreshToken, created_at→createdAt, updated_at→updatedAt
 */

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    refreshToken: row.refresh_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findByEmail(email) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email.toLowerCase()],
  );
  return rowToUser(rows[0]);
}

async function findById(id) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id],
  );
  return rowToUser(rows[0]);
}

async function create({ email, passwordHash, role = 'CUSTOMER' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING *`,
    [email.toLowerCase(), passwordHash, role],
  );
  return rowToUser(rows[0]);
}

async function updateRefreshToken(userId, hashedToken) {
  await pool.query(
    `UPDATE users SET refresh_token = $1, updated_at = NOW() WHERE id = $2`,
    [hashedToken, userId],
  );
}

/**
 * Return a user object without sensitive fields.
 */
function sanitize(user) {
  if (!user) return null;
  const { passwordHash, refreshToken, ...safe } = user;
  return safe;
}

module.exports = {
  findByEmail,
  findById,
  create,
  updateRefreshToken,
  sanitize,
};
