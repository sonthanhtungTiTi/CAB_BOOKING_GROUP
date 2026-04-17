const { redis } = require('shared');
const { updateDriverLocation } = require('../services/locationService');

const CHANNEL = 'driver:location:updates';

/**
 * Redis Subscriber cho Ride Service.
 *
 * Lắng nghe channel `driver:location:updates` từ API Gateway.
 * Thay thế hoàn toàn cơ chế HTTP POST /api/internal/locations
 * cho luồng real-time GPS tracking.
 *
 * Throughput: Hàng nghìn msg/s (Redis in-memory) so với vài trăm req/s (HTTP).
 */
function setupLocationSubscriber() {
  const redisSub = redis.getRedisSubscriber();

  redisSub.subscribe(CHANNEL, (err, count) => {
    if (err) {
      console.error(`[Ride] Failed to subscribe to ${CHANNEL}:`, err.message);
    } else {
      console.log(`[Ride] Subscribed to Redis channel "${CHANNEL}" (${count} channel(s))`);
    }
  });

  redisSub.on('message', async (channel, rawMessage) => {
    if (channel !== CHANNEL) return;

    try {
      const { driverId, lat, lng } = JSON.parse(rawMessage);

      if (!driverId || lat == null || lng == null) {
        console.warn('[Ride] Invalid location payload, skipping');
        return;
      }

      await updateDriverLocation(driverId, lat, lng);
    } catch (err) {
      console.error('[Ride] Failed to process location update:', err.message);
    }
  });

  console.log('[Ride] Location subscriber initialized — listening for GPS updates via Redis Pub/Sub');
}

module.exports = { setupLocationSubscriber };
