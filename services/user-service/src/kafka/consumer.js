const { kafka } = require('shared');
const { KAFKA_TOPICS, UserRole } = require('shared/constants');
const UserProfileModel = require('../models/userProfileModel');

async function setupKafkaConsumer() {
  await kafka.startConsumer(
    'user-service-group',
    [KAFKA_TOPICS.USER_REGISTERED],
    async (topic, partition, payload) => {
      // Logic xử lý event khi 1 Auth user đăng ký thành công
      if (topic === KAFKA_TOPICS.USER_REGISTERED) {
        if (!payload || !payload.userId || !payload.role) return;

        // Chỉ tạo Profile bên user-service nếu role là CUSTOMER
        if (payload.role === UserRole.CUSTOMER) {
          console.log(`[UserConsumer] Incoming customer registration: ${payload.userId}`);
          try {
            await UserProfileModel.createProfile({ userId: payload.userId });
            console.log(`[UserConsumer] Profile initialized for CUSTOMER: ${payload.userId}`);
          } catch (err) {
            console.error('[UserConsumer] Failed to create profile:', err.message);
          }
        }
      }
    }
  );
}

module.exports = { setupKafkaConsumer };
