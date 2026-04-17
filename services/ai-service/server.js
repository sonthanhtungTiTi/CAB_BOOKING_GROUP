require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { setupAiConsumer } = require('./src/kafka/consumer');

const PORT = parseInt(process.env.AI_SERVICE_PORT || '4010', 10);

async function bootstrap() {
  // 1. Start Express FIRST
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 AI Service is running on http://127.0.0.1:${PORT}`);
  });

  // 2. Kafka Consumer (non-blocking)
  try {
    await setupAiConsumer();
  } catch (err) {
    console.error('[AI] Kafka consumer failed (non-critical):', err.message);
  }
}

bootstrap();
