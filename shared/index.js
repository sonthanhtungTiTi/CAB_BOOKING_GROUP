// ─── Barrel export for shared package ────────────────────────
module.exports = {
  ...require('./constants'),
  ...require('./middlewares/errorHandler'),
  ...require('./middlewares/responseWrapper'),
  kafka: require('../infra/kafka/kafkaClient'),
  redis: require('../infra/redis/redisClient'),
};
