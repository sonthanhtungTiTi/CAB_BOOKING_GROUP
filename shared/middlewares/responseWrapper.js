/**
 * Response Wrapper Middleware
 *
 * Monkey-patches res.json() so that every successful response
 * is automatically wrapped in the standard API envelope:
 *   { success, statusCode, message, data, timestamp, path }
 *
 * Error responses bypass this wrapper because they go through
 * the errorHandler middleware instead.
 *
 * Usage:  app.use(responseWrapper);   // before routes
 */
function responseWrapper(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // If the body already has our envelope shape, pass through
    // (error handler already formatted it)
    if (body && typeof body === 'object' && body.success !== undefined) {
      return originalJson(body);
    }

    const wrapped = {
      success: true,
      statusCode: res.statusCode || 200,
      message: 'Success',
      data: body ?? null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    };

    return originalJson(wrapped);
  };

  next();
}

module.exports = { responseWrapper };
