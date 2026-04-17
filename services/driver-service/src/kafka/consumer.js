const { kafka } = require('shared');
const { KAFKA_TOPICS, UserRole } = require('shared/constants');
const DriverProfileModel = require('../models/driverProfileModel');

async function setupKafkaConsumer() {
  await kafka.startConsumer(
    'driver-service-group',
    [KAFKA_TOPICS.USER_REGISTERED, KAFKA_TOPICS.RIDE_ASSIGNED],
    async (topic, partition, payload) => {
      if (!payload) return;

      // ─── user.registered → tạo driver profile ─────────────
      if (topic === KAFKA_TOPICS.USER_REGISTERED) {
        if (!payload.userId || !payload.role) return;

        if (payload.role === UserRole.DRIVER) {
          console.log(`[DriverConsumer] Incoming driver registration: ${payload.userId}`);
          try {
            await DriverProfileModel.createProfile({ userId: payload.userId });
            console.log(`[DriverConsumer] Profile initialized for DRIVER: ${payload.userId}`);
          } catch (err) {
            console.error('[DriverConsumer] Failed to create driver profile:', err.message);
          }
        }
      }

      // ─── ride.assigned → cập nhật status = ON_RIDE ─────────
      if (topic === KAFKA_TOPICS.RIDE_ASSIGNED) {
        if (!payload.driverId) return;

        console.log(`[DriverConsumer] Driver ${payload.driverId} assigned to booking ${payload.bookingId}`);
        try {
          await DriverProfileModel.updateStatus(payload.driverId, 'ON_RIDE');
          console.log(`[DriverConsumer] ✅ Driver ${payload.driverId} → ON_RIDE`);
        } catch (err) {
          console.error(`[DriverConsumer] Failed to update driver status:`, err.message);
        }
      }
    },
  );
}

module.exports = { setupKafkaConsumer };
