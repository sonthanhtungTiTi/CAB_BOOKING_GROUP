const { kafka } = require('shared');
const { KAFKA_TOPICS, BookingStatus } = require('shared/constants');
const FareModel = require('../models/fareModel');

// ─── Giá cước thực tế ────────────────────────────────────────
const BASE_FARE = 15000;   // Mở cửa
const COST_PER_KM = 10000; // Đơn giá mỗi km

/**
 * Tính khoảng cách thực tế giữa 2 tọa độ GPS bằng công thức Haversine.
 * @returns {number} Khoảng cách tính bằng km (làm tròn 2 chữ số thập phân).
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Bán kính Trái Đất (km)
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100; // Làm tròn 2 số thập phân
}

async function setupPricingConsumer() {
  await kafka.startConsumer(
    'pricing-service-group',
    [KAFKA_TOPICS.RIDE_STATUS_UPDATED],
    async (topic, partition, payload) => {
      if (topic !== KAFKA_TOPICS.RIDE_STATUS_UPDATED || !payload) return;

      const { bookingId, status, customerId, pickupLat, pickupLng, destinationLat, destinationLng } = payload;

      if (status !== BookingStatus.COMPLETED) {
        return; // Chỉ tính tiền khi chuyến đi đã hoàn thành
      }

      console.log(`[PricingConsumer] Ride ${bookingId} completed. Calculating fare...`);

      try {
        // Tính khoảng cách thực tế bằng Haversine, fallback 5km nếu thiếu tọa độ
        let distance = 5;
        if (pickupLat != null && pickupLng != null && destinationLat != null && destinationLng != null) {
          distance = calculateHaversineDistance(
            parseFloat(pickupLat), parseFloat(pickupLng),
            parseFloat(destinationLat), parseFloat(destinationLng),
          );
          // Đảm bảo tối thiểu 1km để tránh giá 0đ
          if (distance < 1) distance = 1;
        } else {
          console.warn(`[PricingConsumer] Missing coordinates for ${bookingId}, using fallback 5km`);
        }

        const distanceFare = Math.round(distance * COST_PER_KM);
        const totalAmount = BASE_FARE + distanceFare;

        console.log(`[PricingConsumer] Distance: ${distance}km | Base: ${BASE_FARE} | Distance fare: ${distanceFare} | Total: ${totalAmount} VND`);

        const fareRecord = await FareModel.createFare({
          bookingId,
          baseFare: BASE_FARE,
          distanceFare,
          totalAmount,
        });

        console.log(`[PricingConsumer] ✅ Fare saved for ${bookingId}: ${totalAmount} VND`);

        // Publish event ride.priced
        await kafka.publishEvent(KAFKA_TOPICS.RIDE_PRICED, {
          bookingId: fareRecord.booking_id,
          totalAmount: fareRecord.total_amount,
          currency: fareRecord.currency,
          distance,
          customerId,
          timestamp: new Date().toISOString(),
        });

      } catch (err) {
        console.error(`[PricingConsumer] Error calculating fare for ${bookingId}:`, err.message);
      }
    }
  );

  console.log('[PricingConsumer] Kafka consumer started — listening for ride.status.updated');
}

module.exports = { setupPricingConsumer };

