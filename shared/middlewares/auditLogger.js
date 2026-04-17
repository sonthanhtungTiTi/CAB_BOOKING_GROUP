/**
 * ═══════════════════════════════════════════════════════════════
 *  auditLogger.js — TC100: Security Audit Trail
 *
 *  Ghi lại mọi hành vi thay đổi dữ liệu (POST/PUT/DELETE/PATCH).
 *  Format: [AUDIT SECURITY TRACE] | Timestamp | IP | UserID | Role | Action
 *
 *  Đặc điểm:
 *    - Chỉ log mutation operations (không log GET/HEAD/OPTIONS)
 *    - Ghi cả trước và sau khi request hoàn tất (status code)
 *    - Tách biệt khỏi log debug thông thường
 * ═══════════════════════════════════════════════════════════════
 */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function auditLogger(req, res, next) {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  const startTime = Date.now();

  // Capture user info (may be populated by authMiddleware)
  const userId = req.user?.id || req.headers['x-user-id'] || 'anonymous';
  const role = req.user?.role || 'unknown';
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';

  // Log BEFORE processing
  const logPrefix = `[AUDIT SECURITY TRACE]`;
  const timestamp = new Date().toISOString();
  const action = `${req.method} ${req.originalUrl}`;

  console.log(
    `${logPrefix} | Timestamp: ${timestamp} | IP: ${ip} | ` +
    `UserID: ${userId} | Role: ${role} | Action: ${action}`
  );

  // Hook into response finish to log the result
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const resultTimestamp = new Date().toISOString();
    console.log(
      `${logPrefix} | Timestamp: ${resultTimestamp} | IP: ${ip} | ` +
      `UserID: ${userId} | Role: ${role} | Action: ${action} | ` +
      `Status: ${res.statusCode} | Duration: ${duration}ms`
    );
    originalEnd.apply(res, args);
  };

  next();
}

module.exports = { auditLogger };
