require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { setupMatchingConsumer } = require('./src/kafka/matchingConsumer');
const { setupLocationSubscriber } = require('./src/redis/locationSubscriber');

const PORT = parseInt(process.env.RIDE_SERVICE_PORT || '4005', 10);

async function bootstrap() {
  try {
    // 1. Start Express FIRST (internal API sẵn sàng ngay)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚗 Ride Service is running on http://127.0.0.1:${PORT}`);
    });

    // 2. Kafka matching consumer (non-blocking)
    try {
      await setupMatchingConsumer();
    } catch (err) {
      console.error('[Ride] Kafka consumer failed (non-critical):', err.message);
    }

    // 3. Redis location subscriber
    setupLocationSubscriber();
  } catch (err) {
    console.error('[Ride] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
