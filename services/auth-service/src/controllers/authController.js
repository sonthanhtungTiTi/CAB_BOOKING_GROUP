const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { AppError } = require('shared/middlewares/errorHandler');
const { ERROR_CODES, KAFKA_TOPICS } = require('shared/constants');
const { kafka, redis } = require('shared');

// ─── Env helpers ─────────────────────────────────────────────
const ACCESS_SECRET  = () => process.env.JWT_ACCESS_SECRET  || 'dev_access_secret';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const ACCESS_EXP     = () => process.env.JWT_ACCESS_EXPIRATION  || '15m';
const REFRESH_EXP    = () => process.env.JWT_REFRESH_EXPIRATION || '7d';

// ─── Token generation ────────────────────────────────────────
function generateTokens(user) {
  const payload = { sub: user.id, email: user.email, role: user.role };

  const accessToken = jwt.sign(payload, ACCESS_SECRET(), {
    expiresIn: ACCESS_EXP(),
  });

  const refreshToken = jwt.sign(payload, REFRESH_SECRET(), {
    expiresIn: REFRESH_EXP(),
  });

  return { accessToken, refreshToken, expiresIn: ACCESS_EXP() };
}

async function storeRefreshToken(userId, rawToken) {
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash(rawToken, salt);
  await UserModel.updateRefreshToken(userId, hashed);
}

// ─── Register ────────────────────────────────────────────────
async function register({ email, password, role, name }) {
  const existing = await UserModel.findByEmail(email);
  if (existing) {
    throw new AppError(
      'User with this email already exists',
      409,
      ERROR_CODES.USER_ALREADY_EXISTS,
    );
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await UserModel.create({
    email,
    passwordHash,
    role: role || 'CUSTOMER',
  });

  console.log(`[Auth] User registered: ${user.email} (${user.role})`);

  const tokens = generateTokens(user);
  await storeRefreshToken(user.id, tokens.refreshToken);

  // Publish event to Kafka
  try {
    await kafka.publishEvent(KAFKA_TOPICS.USER_REGISTERED, {
      userId: user.id,
      email: user.email,
      role: user.role,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Auth] Failed to publish USER_REGISTERED event:', err.message);
  }

  // Attach name (display-only, not persisted in DB column)
  const sanitized = UserModel.sanitize(user);
  if (name) sanitized.name = name;

  return { user: sanitized, tokens };
}

// ─── Login ───────────────────────────────────────────────────
async function login({ email, password }) {
  const user = await UserModel.findByEmail(email);
  if (!user) {
    throw new AppError(
      'Invalid email or password',
      401,
      ERROR_CODES.INVALID_CREDENTIALS,
    );
  }

  if (!user.isActive) {
    throw new AppError(
      'Account is deactivated',
      403,
      ERROR_CODES.FORBIDDEN,
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(
      'Invalid email or password',
      401,
      ERROR_CODES.INVALID_CREDENTIALS,
    );
  }

  console.log(`[Auth] User logged in: ${user.email}`);

  const tokens = generateTokens(user);
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { user: UserModel.sanitize(user), tokens };
}

// ─── Validate Token ──────────────────────────────────────────
async function validateToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, ACCESS_SECRET());
  } catch {
    throw new AppError(
      'Invalid or expired token',
      401,
      ERROR_CODES.TOKEN_EXPIRED,
    );
  }

  const user = await UserModel.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError(
      'User not found or deactivated',
      401,
      ERROR_CODES.TOKEN_INVALID,
    );
  }

  return payload;
}

// ─── Refresh Token ───────────────────────────────────────────
async function refreshToken({ refreshToken: rawRefresh }) {
  let payload;
  try {
    payload = jwt.verify(rawRefresh, REFRESH_SECRET());
  } catch {
    throw new AppError(
      'Invalid or expired refresh token',
      401,
      ERROR_CODES.TOKEN_EXPIRED,
    );
  }

  const user = await UserModel.findById(payload.sub);
  if (!user || !user.isActive || !user.refreshToken) {
    throw new AppError(
      'Invalid refresh token',
      401,
      ERROR_CODES.TOKEN_INVALID,
    );
  }

  const isValid = await bcrypt.compare(rawRefresh, user.refreshToken);
  if (!isValid) {
    throw new AppError(
      'Refresh token has been revoked',
      401,
      ERROR_CODES.TOKEN_INVALID,
    );
  }

  const tokens = generateTokens(user);
  await storeRefreshToken(user.id, tokens.refreshToken);

  return { tokens };
}

// ─── Get Profile ─────────────────────────────────────────────
async function getProfile(userId) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError(
      'User not found',
      404,
      ERROR_CODES.USER_NOT_FOUND,
    );
  }
  return UserModel.sanitize(user);
}

// ─── Logout (Redis Token Blacklist) ──────────────────────────
async function logout(token) {
  // Decode to get expiry so we can set a matching TTL
  let payload;
  try {
    payload = jwt.verify(token, ACCESS_SECRET());
  } catch {
    // Even if expired, decode to get info
    payload = jwt.decode(token);
  }

  const redisClient = redis.getRedisClient();
  const ttl = payload && payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 900; // default 15min
  const effectiveTtl = Math.max(ttl, 1);

  await redisClient.set(`token:blacklist:${token}`, '1', 'EX', effectiveTtl);
  console.log(`[Auth] Token blacklisted (TTL: ${effectiveTtl}s)`);

  return { message: 'Logged out successfully' };
}

// ─── Check if token is blacklisted ───────────────────────────
async function isTokenBlacklisted(token) {
  const redisClient = redis.getRedisClient();
  const result = await redisClient.get(`token:blacklist:${token}`);
  return result === '1';
}

module.exports = {
  register,
  login,
  validateToken,
  refreshToken,
  getProfile,
  logout,
  isTokenBlacklisted,
};
