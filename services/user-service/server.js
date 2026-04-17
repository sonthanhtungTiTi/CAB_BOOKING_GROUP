require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { initDatabase } = require('./src/db');
const { setupKafkaConsumer } = require('./src/kafka/consumer');

const PORT = parseInt(process.env.USER_SERVICE_PORT || '4002', 10);

async function bootstrap() {
  try {
    // 1. Init Database (bắt buộc)
    await initDatabase();

    // 2. Start Express FIRST
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`👤 User Service is running on http://127.0.0.1:${PORT}`);
    });

    // 3. Kafka Consumer (non-blocking)
    try {
      await setupKafkaConsumer();
    } catch (err) {
      console.error('[User] Kafka consumer failed (non-critical):', err.message);
    }
  } catch (err) {
    console.error('[User] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
