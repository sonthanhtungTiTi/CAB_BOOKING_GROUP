/**
 * ═══════════════════════════════════════════════════════════════
 *  zeroTrustMiddleware.js — TC94/97: Zero Trust Service-to-Service Auth
 *
 *  "Never trust, always verify" — Mọi request vào internal service
 *  PHẢI có x-internal-service-token hợp lệ.
 *
 *  Flow:
 *    Gateway → chèn x-internal-service-token → Service
 *    Attacker → gọi thẳng port 4004 → THIẾU token → 403
 *
 *  Áp dụng: Bọc toàn bộ /api/internal/* routes của các service.
 * ═══════════════════════════════════════════════════════════════
 */
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN
  || process.env.INTERNAL_SECRET
  || 'cab_internal_secret_2024';

function zeroTrustMiddleware(req, res, next) {
  // Cho phép health check không cần token
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  const token = req.headers['x-internal-service-token']
    || req.headers['x-internal-token'];

  if (!token || token !== INTERNAL_SERVICE_TOKEN) {
    console.warn(
      `[ZERO-TRUST] ❌ BLOCKED direct access | IP: ${req.ip} | ` +
      `Method: ${req.method} | Path: ${req.originalUrl} | ` +
      `Token: ${token ? 'INVALID' : 'MISSING'}`
    );

    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Forbidden: Direct access not allowed. Requests must pass through API Gateway.',
      errorCode: 'ZERO_TRUST_001',
      timestamp: new Date().toISOString(),
    });
  }

  next();
}

module.exports = { zeroTrustMiddleware, INTERNAL_SERVICE_TOKEN };
