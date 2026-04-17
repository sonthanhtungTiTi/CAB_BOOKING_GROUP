const express = require('express');
const morgan = require('morgan');
const { errorHandler } = require('shared/middlewares/errorHandler');
const { responseWrapper } = require('shared/middlewares/responseWrapper');
const { zeroTrustMiddleware } = require('shared/middlewares/zeroTrustMiddleware');
const { auditLogger } = require('shared/middlewares/auditLogger');
const bookingRoutes = require('./src/routes/bookingRoutes');

const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use(responseWrapper);

// ─── TC100: Audit Logger ─────────────────────────────────────
app.use(auditLogger);

// ─── TC94/97: Zero Trust — block direct access without token ─
app.use('/api/internal', zeroTrustMiddleware);

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/internal', bookingRoutes);

// ─── Global Error Handler ────────────────────────────────────
app.use(errorHandler);

module.exports = app;
