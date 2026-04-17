const { redis } = require('shared');

const CHANNEL = 'notifications';

/**
 * Gửi thông báo real-time tới một user cụ thể thông qua Redis Pub/Sub.
 *
 * Gateway (subscriber) sẽ nhận message này và route tới đúng Socket.io client.
 *
 * @param {string} targetUserId - UUID của user nhận thông báo
 * @param {string} type         - Loại notification (VD: RIDE_ASSIGNED, RIDE_NO_DRIVER)
 * @param {string} message      - Nội dung thông báo
 * @param {object} [data]       - Dữ liệu bổ sung (bookingId, driverId, v.v.)
 */
async function sendNotification(targetUserId, type, message, data = null) {
  const publisher = redis.getRedisPublisher();

  const payload = JSON.stringify({
    targetUserId,
    type,
    message,
    data,
  });

  await publisher.publish(CHANNEL, payload);
  console.log(`[Notification] Sent to ${targetUserId} | Type: ${type} | Message: ${message}`);
}

module.exports = { sendNotification };
