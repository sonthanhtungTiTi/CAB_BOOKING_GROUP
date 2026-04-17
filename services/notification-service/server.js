require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { setupNotificationConsumer } = require('./src/kafka/consumer');

const PORT = parseInt(process.env.NOTIFICATION_SERVICE_PORT || '4008', 10);

async function bootstrap() {
  // 1. Start Express FIRST (HTTP endpoints phải sẵn sàng ngay)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔔 Notification Service is running on http://127.0.0.1:${PORT}`);
  });

  // 2. Start Kafka Consumer (non-blocking — nếu Kafka chưa sẵn sàng thì retry)
  try {
    await setupNotificationConsumer();
  } catch (err) {
    console.error('[Notification] Kafka consumer failed to start (non-critical):', err.message);
    console.error('[Notification] HTTP endpoints still available. Kafka will be retried...');
  }
}

bootstrap();
