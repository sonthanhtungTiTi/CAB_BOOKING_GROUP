require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { initDatabase } = require('./src/db');
const { setupPricingConsumer } = require('./src/kafka/consumer');

const PORT = parseInt(process.env.PRICING_SERVICE_PORT || '4006', 10);

async function bootstrap() {
  try {
    // 1. Database Init (bắt buộc)
    await initDatabase();

    // 2. Start Express FIRST
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`💰 Pricing Service is running on http://127.0.0.1:${PORT}`);
    });

    // 3. Kafka Consumer (non-blocking)
    try {
      await setupPricingConsumer();
    } catch (err) {
      console.error('[Pricing] Kafka consumer failed (non-critical):', err.message);
    }
  } catch (err) {
    console.error('[Pricing] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
