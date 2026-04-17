const express = require('express');
const morgan = require('morgan');
const { errorHandler } = require('shared/middlewares/errorHandler');
const { auditLogger } = require('shared/middlewares/auditLogger');
const { zeroTrustMiddleware } = require('shared/middlewares/zeroTrustMiddleware');

const app = express();

app.use(express.json());
app.use(morgan('dev'));

// ─── TC100: Audit mọi request làm thay đổi dữ liệu ─────────
app.use(auditLogger);

// ─── TC94/97: ZERO TRUST — chặn mọi request không qua Gateway ─
app.use(zeroTrustMiddleware);

const aiRoutes = require('./src/routes/aiRoutes');

// ─── Health Check ────────────────────────────────────────────
app.get('/api/internal/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-service', timestamp: new Date().toISOString() });
});

app.use('/api/ai', aiRoutes);

// ─── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

module.exports = app;
