const { ERROR_CODES } = require('../constants');

/**
 * Map HTTP status code to an internal error code.
 */
function mapStatusToErrorCode(status) {
  switch (status) {
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.FORBIDDEN;
    case 404: return ERROR_CODES.USER_NOT_FOUND;
    case 400: return ERROR_CODES.VALIDATION_ERROR;
    case 408: return ERROR_CODES.REQUEST_TIMEOUT;
    case 503: return ERROR_CODES.SERVICE_UNAVAILABLE;
    default:  return ERROR_CODES.INTERNAL_ERROR;
  }
}

/**
 * AppError — Operational error with statusCode + errorCode.
 * Throw this in controllers/services to produce structured error responses.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = ERROR_CODES.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Express Error-handling Middleware
 *
 * Catches all errors (AppError, Axios proxy errors, and unknown)
 * and returns a standardised JSON error shape.
 *
 * Usage:  app.use(errorHandler);   // MUST be the last middleware
 */
function errorHandler(err, req, res, _next) {
  // ── Structured operational error (thrown by our code) ──────
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errorCode: err.errorCode,
      errors: null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }

  // ── Axios error (proxy call to another microservice failed) ─
  if (err.isAxiosError) {
    const downstream = err.response;
    if (downstream && downstream.data) {
      // Forward the downstream service's structured error as-is
      const d = downstream.data;
      return res.status(downstream.status || 502).json({
        success: false,
        statusCode: downstream.status || 502,
        message: d.message || 'Downstream service error',
        errorCode: d.errorCode || mapStatusToErrorCode(downstream.status),
        errors: d.errors || null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }

    // No response at all (service unreachable)
    return res.status(503).json({
      success: false,
      statusCode: 503,
      message: 'Service unavailable',
      errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
      errors: null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }

  // ── Express body-parser / JSON parse error ─────────────────
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'Invalid JSON in request body',
      errorCode: ERROR_CODES.VALIDATION_ERROR,
      errors: null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }

  // ── Unknown / unhandled error ──────────────────────────────
  console.error('[ErrorHandler] Unhandled error:', err);
  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error',
    errorCode: ERROR_CODES.INTERNAL_ERROR,
    errors: null,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
}

module.exports = { errorHandler, AppError };
