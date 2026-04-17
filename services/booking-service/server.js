require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { initDatabase } = require('./src/db');
const { setupBookingConsumer } = require('./src/kafka/consumer');
const { startOutboxPublisher } = require('./src/kafka/outboxPublisher');

const PORT = parseInt(process.env.BOOKING_SERVICE_PORT || '4004', 10);

async function bootstrap() {
  try {
    // 1. Init Database (bắt buộc — schema phải sẵn sàng)
    await initDatabase();

    // 2. Start Express FIRST (HTTP endpoints sẵn sàng ngay)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`📦 Booking Service is running on http://127.0.0.1:${PORT}`);
    });

    // 3. Kafka Consumer (non-blocking)
    try {
      await setupBookingConsumer();
    } catch (err) {
      console.error('[Booking] Kafka consumer failed (non-critical):', err.message);
    }

    // 4. TC38: Start Outbox Publisher (non-blocking background worker)
    startOutboxPublisher(2000);
  } catch (err) {
    console.error('[Booking] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
