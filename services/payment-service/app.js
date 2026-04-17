const express = require('express');
const morgan = require('morgan');
const { errorHandler } = require('shared/middlewares/errorHandler');
const { responseWrapper } = require('shared/middlewares/responseWrapper');
const { zeroTrustMiddleware } = require('shared/middlewares/zeroTrustMiddleware');
const { auditLogger } = require('shared/middlewares/auditLogger');
const paymentRoutes = require('./src/routes/paymentRoutes');

const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use(responseWrapper);
app.use(auditLogger);

// ─── TC94/97: Zero Trust — block direct access without token ─
app.use('/api/internal', zeroTrustMiddleware);

app.use('/api/internal', paymentRoutes);

app.get('/api/internal/health', (_req, res) => {
  res.json({ status: 'ok', service: 'payment-service', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

module.exports = app;
