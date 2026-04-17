const express = require('express');
const { auditLogger } = require('shared/middlewares/auditLogger');
const { zeroTrustMiddleware } = require('shared/middlewares/zeroTrustMiddleware');
const reviewRoutes = require('./src/routes/reviewRoutes');

const app = express();

// ─── Core Middleware ─────────────────────────────────────────
app.use(express.json());

// ─── TC100: Audit mọi request làm thay đổi dữ liệu ─────────
app.use(auditLogger);

// ─── TC94/97: ZERO TRUST — chặn mọi request không qua Gateway ─
app.use(zeroTrustMiddleware);

// ─── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'review-service' });
});

// ─── Internal API Routes ────────────────────────────────────
app.use('/api/internal/reviews', reviewRoutes);

// ─── 404 Handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: 'Route not found',
    errorCode: 'SYS_001',
    errors: null,
    timestamp: new Date().toISOString(),
    path: _req.originalUrl,
  });
});

// ─── Global Error Handler ────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[review-service] Unhandled error:', err);
  res.status(500).json({
    success: false,
    statusCode: 500,
    message: 'Internal server error',
    errorCode: 'SYS_001',
    errors: null,
    timestamp: new Date().toISOString(),
    path: _req.originalUrl,
  });
});

module.exports = app;
