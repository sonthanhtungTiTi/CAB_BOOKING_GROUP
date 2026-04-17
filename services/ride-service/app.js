const express = require('express');
const morgan = require('morgan');
const { errorHandler } = require('shared/middlewares/errorHandler');
const { responseWrapper } = require('shared/middlewares/responseWrapper');
const { auditLogger } = require('shared/middlewares/auditLogger');
const { zeroTrustMiddleware } = require('shared/middlewares/zeroTrustMiddleware');
const locationRoutes = require('./src/routes/locationRoutes');

const app = express();

// ─── Core Middleware ─────────────────────────────────────────
app.use(express.json());
app.use(morgan('dev'));

// ─── TC100: Audit mọi request làm thay đổi dữ liệu ─────────
app.use(auditLogger);

// ─── Response Wrapper ────────────────────────────────────────
app.use(responseWrapper);

// ─── TC94/97: ZERO TRUST — chặn mọi request không qua Gateway ─
app.use(zeroTrustMiddleware);

// ─── Routes (internal API, prefix: /api/internal) ────────────
app.use('/api/internal', locationRoutes);

// ─── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

module.exports = app;
