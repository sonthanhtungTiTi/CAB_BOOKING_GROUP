/**
 * ═══════════════════════════════════════════════════════════════
 *  verifyInternalRequest.js — TC88: Service-to-Service Security
 *
 *  Middleware kiểm tra header x-internal-token trên các API nội bộ.
 *  Gateway gửi kèm shared secret → Service verify → nếu thiếu → 403.
 *
 *  Chống tấn công: User bên ngoài KHÔNG thể gọi trực tiếp vào
 *  port nội bộ (4001, 4004, ...) nếu không có secret.
 * ═══════════════════════════════════════════════════════════════
 */
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'cab_internal_secret_2024';

function verifyInternalRequest(req, res, next) {
  const token = req.headers['x-internal-token'];

  if (!token || token !== INTERNAL_SECRET) {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      message: 'Forbidden: internal-only endpoint. Missing or invalid x-internal-token.',
      errorCode: 'INTERNAL_001',
    });
  }

  next();
}

module.exports = { verifyInternalRequest, INTERNAL_SECRET };
