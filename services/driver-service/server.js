require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { initDatabase } = require('./src/db');
const { setupKafkaConsumer } = require('./src/kafka/consumer');

const PORT = parseInt(process.env.DRIVER_SERVICE_PORT || '4003', 10);

async function bootstrap() {
  try {
    // 1. Init Database (bắt buộc)
    await initDatabase();

    // 2. Start Express FIRST
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚖 Driver Service is running on http://127.0.0.1:${PORT}`);
    });

    // 3. Kafka Consumer (non-blocking)
    try {
      await setupKafkaConsumer();
    } catch (err) {
      console.error('[Driver] Kafka consumer failed (non-critical):', err.message);
    }
  } catch (err) {
    console.error('[Driver] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
