const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const path = require('path');
const { getRedisClient } = require(path.resolve(__dirname, '../../../infra/redis/redisClient'));

const redisClient = getRedisClient();

const apiLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
  windowMs: 60 * 1000, // 1 phút
  max: 200, // TC67: 200 requests / phút / IP (k6 validates rate limiting at scale)
  standardHeaders: true, // Trả về RateLimit-* headers
  legacyHeaders: false, // Xoá X-RateLimit-* headers
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
});

module.exports = apiLimiter;
