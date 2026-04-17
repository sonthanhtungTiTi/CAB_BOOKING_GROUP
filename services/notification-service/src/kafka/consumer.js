const { kafka } = require('shared');
const { KAFKA_TOPICS } = require('shared/constants');
const { sendNotification } = require('../services/notificationSender');

/**
 * Kafka Consumer cho notification-service.
 *
 * Lắng nghe:
 *  - ride.assigned       → thông báo cho cả CUSTOMER và DRIVER
 *  - ride.matching.failed → thông báo cho CUSTOMER
 *  - payment.completed   → thông báo cho CUSTOMER (biên lai)
 *  - ride_events         → TC24/26: ride_accepted → thông báo cho driver
 */
async function setupNotificationConsumer() {
  await kafka.startConsumer(
    'notification-service-group',
    [
      KAFKA_TOPICS.RIDE_ASSIGNED,
      KAFKA_TOPICS.RIDE_MATCHING_FAILED,
      KAFKA_TOPICS.PAYMENT_COMPLETED,
      KAFKA_TOPICS.RIDE_PRICED,
      'ride_events',
    ],
    async (topic, partition, payload) => {
      if (!payload) return;

      // ─── ride_events (TC24, TC26) ───────────────────────────
      if (topic === 'ride_events') {
        const { event_type, ride_id, driver_id, user_id } = payload;

        if (event_type === 'ride_accepted' && driver_id) {
          console.log(`[NotifConsumer] Notification sent to driver ${driver_id}`);
          await sendNotification(
            driver_id,
            'RIDE_ACCEPTED',
            `Bạn đã nhận cuốc xe ${ride_id}. Hãy đến điểm đón!`,
            { ride_id, driver_id },
          );
        }

        if (event_type === 'ride_requested' && user_id) {
          console.log(`[NotifConsumer] Notification sent to user ${user_id}: ride_requested`);
          await sendNotification(
            user_id,
            'RIDE_REQUESTED',
            `Đang tìm tài xế cho cuốc xe ${ride_id}...`,
            { ride_id, user_id },
          );
        }

        return;
      }

      // ─── ride.assigned ─────────────────────────────────────
      if (topic === KAFKA_TOPICS.RIDE_ASSIGNED) {
        const { bookingId, driverId, customerId, distance } = payload;

        if (!customerId || !driverId || !bookingId) {
          console.warn('[NotifConsumer] ride.assigned missing fields:', payload);
          return;
        }

        console.log(`[NotifConsumer] ride.assigned | Booking: ${bookingId} | Driver: ${driverId} | Customer: ${customerId}`);

        await sendNotification(
          customerId,
          'RIDE_ASSIGNED',
          'Đã tìm thấy tài xế! Tài xế đang đến đón bạn.',
          { bookingId, driverId, distance: distance ? `${distance}km` : null },
        );

        await sendNotification(
          driverId,
          'NEW_RIDE',
          'Bạn có cuốc xe mới! Vui lòng tới điểm đón.',
          { bookingId, customerId },
        );
      }

      // ─── ride.matching.failed ──────────────────────────────
      if (topic === KAFKA_TOPICS.RIDE_MATCHING_FAILED) {
        const { bookingId, customerId, reason } = payload;

        if (!customerId || !bookingId) {
          console.warn('[NotifConsumer] ride.matching.failed missing fields:', payload);
          return;
        }

        console.log(`[NotifConsumer] ride.matching.failed | Booking: ${bookingId}`);
        await sendNotification(
          customerId,
          'RIDE_NO_DRIVER',
          'Rất tiếc, hiện không có tài xế nào gần bạn. Vui lòng thử lại sau.',
          { bookingId, reason: reason || 'No drivers available' },
        );
      }

      // ─── ride.priced ───────────────────────────────────────
      if (topic === KAFKA_TOPICS.RIDE_PRICED) {
        const { bookingId, customerId, totalAmount } = payload;

        if (!customerId || !bookingId) {
          console.warn('[NotifConsumer] ride.priced missing fields:', payload);
          return;
        }

        console.log(`[NotifConsumer] ride.priced | Booking: ${bookingId} | Amount: ${totalAmount}`);
        await sendNotification(customerId, 'RIDE_COMPLETED', 'Chuyến đi hoàn thành. Đang chờ thanh toán!', payload);
      }

      // ─── payment.completed ─────────────────────────────────
      if (topic === KAFKA_TOPICS.PAYMENT_COMPLETED) {
        const { bookingId, customerId, amount, currency } = payload;

        if (!customerId || !bookingId) {
          console.warn('[NotifConsumer] payment.completed missing fields:', payload);
          return;
        }

        console.log(`[NotifConsumer] payment.completed | Booking: ${bookingId} | Amount: ${amount}`);
        await sendNotification(
          customerId,
          'PAYMENT_RECEIPT',
          `Thanh toán thành công! Số tiền: ${amount} ${currency}. Cảm ơn bạn đã sử dụng dịch vụ.`,
          { bookingId, amount, currency },
        );
      }
    },
  );

  console.log('[NotifConsumer] Kafka consumer started — listening for ride.assigned, ride.matching.failed, payment.completed, ride.priced, ride_events');
}

module.exports = { setupNotificationConsumer };
