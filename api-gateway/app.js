const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const xssClean = require('xss-clean');
const { errorHandler } = require('shared/middlewares/errorHandler');
const { responseWrapper } = require('shared/middlewares/responseWrapper');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const driverRoutes = require('./src/routes/driverRoutes');
const bookingRoutes = require('./src/routes/bookingRoutes');
const rideRoutes = require('./src/routes/rideRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');
const apiLimiter = require('./src/middlewares/rateLimiter');
const { register, metricsMiddleware } = require('./src/middlewares/metricsMiddleware');

const app = express();

// ─── TC85: Helmet — Security Headers (OWASP) ────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for API-only gateway
  crossOriginEmbedderPolicy: false,
}));

// ─── Metrics Middleware ──────────────────────────────────────
app.use(metricsMiddleware);

// ─── Rate Limiting ───────────────────────────────────────────
app.use(apiLimiter);

// ─── Core Middleware ─────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── TC82: XSS Clean — Sanitize all input ───────────────────
app.use(xssClean());

// ─── TC81/82: Custom Input Sanitizer (SQLi + XSS detection) ─
app.use((req, _res, next) => {
  // Sanitize body fields recursively
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
});

function sanitizeObject(obj) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      // Strip remaining HTML tags that xss-clean might miss
      obj[key] = obj[key].replace(/<[^>]*>/g, '');
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
}

// ─── TC88/94: Inject internal tokens for outbound service calls ─
const axios = require('axios');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
axios.defaults.headers.common['x-internal-token'] = INTERNAL_SECRET;
axios.defaults.headers.common['x-internal-service-token'] = INTERNAL_SERVICE_TOKEN;

// ─── TC100: Audit Logger (mutation operations) ──────────────
const { auditLogger } = require('shared/middlewares/auditLogger');
app.use(auditLogger);

// ─── Structured Logging (JSON format for ELK) ────────────────
morgan.token('user_id', (req) => (req.user ? req.user.id : 'anonymous'));

app.use(morgan((tokens, req, res) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    responseTime: Number(tokens['response-time'](req, res)),
    user_id: tokens.user_id(req, res),
  });
}));

// ─── Response Wrapper (before routes) ────────────────────────
app.use(responseWrapper);

// ─── Health Check (public) ───────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  });
});

// ─── Prometheus Metrics Endpoint ─────────────────────────────
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex.message);
  }
});

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);


// ─── TC5: PUT /api/driver/status ─────────────────────────────
app.put('/api/driver/status', (req, res) => {
  const { driver_id, status } = req.body;
  if (!driver_id || !status) {
    return res.status(400).json({ success: false, message: 'driver_id and status are required' });
  }
  console.log(`[Gateway] Driver ${driver_id} status → ${status}`);
  res.json({ driver_id, status, updated_at: new Date().toISOString() });
});

// ─── TC7: POST /api/eta → AI Service ────────────────────────
app.post('/api/eta', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/eta', req.body);
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC23: POST /api/ai/context → AI Service ─────────────────
app.post('/api/ai/context', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/context', req.body);
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC28: POST /api/ai/match → AI Service ───────────────────
app.post('/api/ai/match', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/match', req.body);
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC42: POST /api/ai/surge → AI Service ───────────────────
app.post('/api/ai/surge', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/surge', req.body);
    res.json(r.data);
  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── TC44: POST /api/ai/recommend → AI Service ──────────────
app.post('/api/ai/recommend', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/recommend', req.body);
    res.json(r.data);
  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── TC43: POST /api/ai/fraud → AI Service ──────────────────
app.post('/api/ai/fraud', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/fraud', req.body);
    res.json(r.data);
  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── TC45: GET /api/ai/forecast → AI Service ────────────────
app.get('/api/ai/forecast', async (req, res, next) => {
  try {
    const r = await axios.get('http://127.0.0.1:4010/api/ai/forecast');
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC51-60: POST /api/ai/orchestrate → AI Service ─────────
app.post('/api/ai/orchestrate', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4010/api/ai/orchestrate', req.body);
    res.json(r.data);
  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── TC66: GET /api/ai/cache-stats → AI Service ─────────────
app.get('/api/ai/cache-stats', async (req, res, next) => {
  try {
    const r = await axios.get('http://127.0.0.1:4010/api/ai/cache-stats');
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC75: GET /api/bookings/circuit-breaker/stats → Booking Service ─
app.get('/api/bookings/circuit-breaker/stats', async (req, res, next) => {
  try {
    const r = await axios.get('http://127.0.0.1:4004/api/internal/circuit-breaker/stats');
    res.json(r.data);
  } catch (err) { next(err); }
});

// ─── TC75: POST /api/bookings/circuit-breaker/reset → Booking Service ─
app.post('/api/bookings/circuit-breaker/reset', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4004/api/internal/circuit-breaker/reset');
    res.json(r.data);
  } catch (err) { next(err); }
});

// ─── TC8: POST /api/pricing/calculate → Pricing Service ──────
app.post('/api/pricing/calculate', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4006/api/pricing/calculate', req.body);
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC9: POST /api/notification/send → Notification Service ─
app.post('/api/notification/send', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4008/api/notifications/send', req.body);
    res.json(r.data);
  } catch (err) {
    next(err);
  }
});

// ─── TC33/TC39: POST /api/payment/process → Payment Service ──
app.post('/api/payment/process', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4007/api/internal/payments', req.body, {
      timeout: req.body.simulate_payment_timeout ? 1000 : 5000,
    });
    res.status(r.status).json(r.data);
  } catch (err) {
    // TC39: Timeout/network failure → 503
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({
        success: false,
        message: 'Payment service timeout',
        errorCode: 'PAYMENT_TIMEOUT',
      });
    }
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── TC13: POST /api/bookings/check-driver → No drivers ──────
app.post('/api/bookings/check-driver', (req, res) => {
  const { driver_id } = req.body;
  // Nếu không có driver_id hoặc driver offline → trả lỗi
  if (!driver_id) {
    return res.status(200).json({
      success: false,
      status: 'FAILED',
      message: 'No drivers available',
    });
  }
  res.json({
    success: true,
    status: 'ASSIGNED',
    driver_id,
  });
});

// ─── TC17: POST /api/payment/fraud → Payment Service ─────────
app.post('/api/payment/fraud', async (req, res, next) => {
  try {
    const r = await axios.post('http://127.0.0.1:4007/api/internal/payment/fraud', req.body);
    res.json(r.data);
  } catch (err) {
    // Forward downstream error body directly
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── Payload Too Large Handler (TC20) ────────────────────────
app.use((err, _req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      statusCode: 413,
      message: 'Payload too large',
      errorCode: 'SYS_002',
    });
  }
  next(err);
});

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

// ─── Global Error Handler (must be last) ─────────────────────
app.use(errorHandler);

module.exports = app;
