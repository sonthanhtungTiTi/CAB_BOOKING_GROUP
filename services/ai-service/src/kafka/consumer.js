const { kafka } = require('shared');
const { KAFKA_TOPICS } = require('shared/constants');
const { fetchContext } = require('../services/contextBuilder');
const aiAgent = require('../services/aiAgent');

async function setupAiConsumer() {
  await kafka.startConsumer(
    'ai-service-matching-group',
    [KAFKA_TOPICS.RIDE_CREATED],
    async (topic, partition, payload) => {
      if (!payload || topic !== KAFKA_TOPICS.RIDE_CREATED) return;

      const { bookingId, pickupLat, pickupLng, customerId } = payload;

      if (!bookingId || pickupLat == null || pickupLng == null) {
        console.error('[AiConsumer] Invalid payload:', payload);
        return;
      }

      console.log(`\n[AiConsumer] 🔥 Tìm cuốc AI cho Booking: ${bookingId}`);

      // Delay 3s để đảm bảo HTTP response (status=REQUESTED) đã trả về cho client
      // trước khi AI bắt đầu matching và có thể ghi đè trạng thái trong DB.
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        // BƯỚC 1: Xây dựng Context
        const context = await fetchContext(pickupLat, pickupLng);

        // BƯỚC 2: Truyền Context vào AI Agent
        const matchResult = aiAgent.processRideRequest(context);

        // BƯỚC 3: Xử lý kết quả
        if (matchResult && matchResult.driverId) {
          console.log(
            `[AiConsumer] ✅ MATCHED: Driver ${matchResult.driverId} | Surge: ${matchResult.surgeMultiplier}x | ETA: ${matchResult.eta} mins | Fallback: ${matchResult.isFallback}`,
          );

          await kafka.publishEvent(KAFKA_TOPICS.RIDE_ASSIGNED, {
            bookingId,
            driverId: matchResult.driverId,
            customerId,
            distance: matchResult.distance,
            status: 'ASSIGNED',
            surgeMultiplier: matchResult.surgeMultiplier,
            eta: matchResult.eta,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Chuyển sang SEARCHING thay vì NO_DRIVER ngay lập tức
          // Cho hệ thống thời gian tìm kiếm tài xế trong vùng rộng hơn
          console.log(`[AiConsumer] ⏳ SEARCHING: Chưa tìm thấy driver, giữ trạng thái SEARCHING`);
          await kafka.publishEvent(KAFKA_TOPICS.RIDE_MATCHING_FAILED, {
            bookingId,
            customerId,
            status: 'SEARCHING',
            reason: 'No drivers available yet — searching wider area',
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error(`[AiConsumer] LỖI HỆ THỐNG:`, err.message);
        try {
          await kafka.publishEvent(KAFKA_TOPICS.RIDE_MATCHING_FAILED, {
            bookingId,
            customerId,
            status: 'ERROR',
            reason: 'System Error during matching calculation',
            timestamp: new Date().toISOString(),
          });
        } catch (_) {}
      }
    },
  );

  console.log('[AiConsumer] Kafka consumer started — listening for ride.created');
}

module.exports = { setupAiConsumer };
