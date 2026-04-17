require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3008;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cab_review_db';

// ─── MongoDB Connection ──────────────────────────────────────
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`[review-service] ✅ Connected to MongoDB: ${MONGO_URI}`);
  } catch (err) {
    console.error('[review-service] ❌ MongoDB connection failed:', err.message);
    // Retry sau 5 giây
    console.log('[review-service] Retrying in 5 seconds...');
    setTimeout(connectDB, 5000);
    return;
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`[review-service] ${signal} received. Shutting down gracefully...`);
  mongoose.connection.close().then(() => {
    console.log('[review-service] MongoDB connection closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Start Server ────────────────────────────────────────────
async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[review-service] 🚀 Running on port ${PORT}`);
  });
}

start();
