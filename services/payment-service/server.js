require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { initDatabase } = require('./src/db');

const PORT = parseInt(process.env.PAYMENT_SERVICE_PORT || '4007', 10);

async function bootstrap() {
  try {
    await initDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`💳 Payment Service is running on http://127.0.0.1:${PORT}`);
    });
  } catch (err) {
    console.error('[Payment] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
