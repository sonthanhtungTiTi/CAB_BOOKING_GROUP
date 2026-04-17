const { kafka } = require('shared');
const { KAFKA_TOPICS } = require('shared/constants');
const BookingModel = require('../models/bookingModel');

/**
 * Kafka Consumer cho booking-service.
 *
 * Lắng nghe:
 *  - ride.assigned        → cập nhật booking status = ASSIGNED + gán driverId
 *  - ride.matching.failed → cập nhật booking status = NO_DRIVER
 *  - payment.failed       → cập nhật booking status = CANCELLED (Saga Rollback)
 */
async function setupBookingConsumer() {
  await kafka.startConsumer(
    'booking-service-group',
    [KAFKA_TOPICS.RIDE_ASSIGNED, KAFKA_TOPICS.RIDE_MATCHING_FAILED, KAFKA_TOPICS.PAYMENT_FAILED],
    async (topic, partition, payload) => {
      if (!payload || !payload.bookingId) return;

      // ─── ride.assigned ─────────────────────────────────────
      if (topic === KAFKA_TOPICS.RIDE_ASSIGNED) {
        try {
          const booking = await BookingModel.findById(payload.bookingId);
          if (booking && booking.status !== 'PENDING') {
            console.log('[RaceCondition] Bỏ qua cập nhật ASSIGNED do chuyến đi đã chuyển trạng thái:', booking.status);
            return;
          }

          const updated = await BookingModel.updateStatus(
            payload.bookingId,
            'ASSIGNED',
            payload.driverId,
          );
          console.log(
            `[BookingConsumer] ✅ Booking ${payload.bookingId} → ASSIGNED to driver ${payload.driverId}`,
          );
        } catch (err) {
          console.error(`[BookingConsumer] Failed to update booking ${payload.bookingId}:`, err.message);
        }
      }

      // ─── ride.matching.failed ──────────────────────────────
      if (topic === KAFKA_TOPICS.RIDE_MATCHING_FAILED) {
        try {
          // TC37: Guard — don't overwrite terminal states (CANCELLED, COMPLETED)
          const booking = await BookingModel.findById(payload.bookingId);
          if (booking && ['CANCELLED', 'COMPLETED'].includes(booking.status)) {
            console.log(`[BookingConsumer] Skip matching.failed — booking ${payload.bookingId} already ${booking.status}`);
            return;
          }

          // Giữ trạng thái SEARCHING thay vì NO_DRIVER ngay lập tức
          const newStatus = payload.status === 'SEARCHING' ? 'SEARCHING' : 'NO_DRIVER';
          await BookingModel.updateStatus(payload.bookingId, newStatus);
          console.log(
            `[BookingConsumer] ⏳ Booking ${payload.bookingId} → ${newStatus} (${payload.reason})`,
          );
        } catch (err) {
          console.error(`[BookingConsumer] Failed to update booking ${payload.bookingId}:`, err.message);
        }
      }

      // ─── payment.failed (Saga Rollback) ────────────────────────
      if (topic === KAFKA_TOPICS.PAYMENT_FAILED) {
        try {
          await BookingModel.updateStatus(payload.bookingId, 'CANCELLED');
          console.log(
            `[Saga] Payment failed. Rolled back booking ${payload.bookingId} to CANCELLED.`,
          );
        } catch (err) {
          console.error(`[Saga] Failed to rollback booking ${payload.bookingId}:`, err.message);
        }
      }
    },
  );

  console.log('[BookingConsumer] Kafka consumer started — listening for ride.assigned, ride.matching.failed, payment.failed');
}

module.exports = { setupBookingConsumer };
