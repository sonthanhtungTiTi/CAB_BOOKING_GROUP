const express = require('express');
const morgan = require('morgan');
const { errorHandler } = require('shared/middlewares/errorHandler');
const { responseWrapper } = require('shared/middlewares/responseWrapper');
const { auditLogger } = require('shared/middlewares/auditLogger');
const { zeroTrustMiddleware } = require('shared/middlewares/zeroTrustMiddleware');
const authRoutes = require('./src/routes/authRoutes');

const app = express();

// ─── Core Middleware ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── TC100: Audit mọi request làm thay đổi dữ liệu ─────────
app.use(auditLogger);

// ─── Response Wrapper (must be before routes) ────────────────
app.use(responseWrapper);

// ─── TC94/97: ZERO TRUST — chặn mọi request không qua Gateway ─
app.use(zeroTrustMiddleware);

// ─── Routes ──────────────────────────────────────────────────
app.use('/', authRoutes);

// ─── Global Error Handler (must be last) ─────────────────────
app.use(errorHandler);

module.exports = app;
