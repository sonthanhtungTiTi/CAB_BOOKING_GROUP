const { kafka } = require('shared');
const { KAFKA_TOPICS } = require('shared/constants');
const locationService = require('../services/locationService');

const MATCHING_RADIUS_KM = 5;

/**
 * Kafka Consumer cho ride-service.
 *
 * Lắng nghe topic ride.created, thực hiện thuật toán matching:
 *  - GEORADIUS tìm driver gần nhất trong bán kính 5km.
 *  - Nếu tìm thấy → publish ride.assigned
 *  - Nếu không     → publish ride.matching.failed
 */
async function setupMatchingConsumer() {
  await kafka.startConsumer(
    'ride-service-matching-group',
    [KAFKA_TOPICS.RIDE_CREATED],
    async (topic, partition, payload) => {
      // NOTE: Matching logic đã được vô hiệu hóa ở Phase 9.
      // ai-service sẽ đảm nhận nghe ride.created và match, pricing, ETA.
      // ride-service lúc này CHỈ dùng làm GeoRedis backend để query.
      console.log(`[RideService-Disabled] Bỏ qua event ride.created cho booking ${payload?.bookingId}`);
    },
  );

  console.log('[Matching] Kafka consumer started — listening for ride.created');
}

module.exports = { setupMatchingConsumer };
