require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = require('./app');
const { initDatabase } = require('./src/db');

const PORT = parseInt(process.env.AUTH_SERVICE_PORT || '4001', 10);

async function bootstrap() {
  try {
    // Initialise Postgres tables
    await initDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🔐 Auth Service is running on http://127.0.0.1:${PORT}`);
    });
  } catch (err) {
    console.error('[Auth] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
