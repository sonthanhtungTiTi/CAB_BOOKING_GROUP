const Redis = require('ioredis');

let client = null;
let publisher = null;
let subscriber = null;

/**
 * Tạo Redis connection options từ environment.
 */
function buildRedisOptions() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
  };
}

/**
 * Tạo một Redis instance từ REDIS_URL hoặc individual config.
 */
function createInstance(label) {
  const redisUrl = process.env.REDIS_URL || null;
  const instance = redisUrl ? new Redis(redisUrl) : new Redis(buildRedisOptions());

  instance.on('connect', () => {
    console.log(`[Redis:${label}] Connected successfully`);
  });

  instance.on('error', (err) => {
    console.error(`[Redis:${label}] Connection error:`, err.message);
  });

  return instance;
}

/**
 * Lấy hoặc tạo Redis client chính (Singleton).
 * Dùng cho các lệnh thông thường: GET, SET, GEOADD, GEORADIUS, v.v.
 */
function getRedisClient() {
  if (!client) {
    client = createInstance('Main');
  }
  return client;
}

/**
 * Lấy hoặc tạo Redis Publisher (Singleton).
 * Dùng riêng cho redis.publish() — tách ra để không conflict với subscriber.
 */
function getRedisPublisher() {
  if (!publisher) {
    publisher = createInstance('Publisher');
  }
  return publisher;
}

/**
 * Lấy hoặc tạo Redis Subscriber (Singleton).
 * Khi một ioredis connection đã gọi .subscribe(), nó chỉ có thể nhận message,
 * KHÔNG thể dùng cho bất kỳ lệnh nào khác (GEOADD, GET, SET, ...).
 * Do đó BẮT BUỘC phải tách riêng instance này.
 */
function getRedisSubscriber() {
  if (!subscriber) {
    subscriber = createInstance('Subscriber');
  }
  return subscriber;
}

module.exports = {
  getRedisClient,
  getRedisPublisher,
  getRedisSubscriber,
};
