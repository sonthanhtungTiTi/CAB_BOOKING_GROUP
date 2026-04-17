const authService = require('../services/authService');

/**
 * ═══════════════════════════════════════════════════════════════
 *  authMiddleware — TC91/92/93: Zero Trust Authentication
 *
 *  Express middleware implementing Zero Trust authentication.
 *  1. Extract Bearer token from Authorization header.
 *  2. Call auth-service /validate-token via HTTP.
 *  3. Attach decoded user payload to req.user.
 *
 *  TC91: Missing token    → 401 { message: "Missing token" }
 *  TC92: Expired token    → 401 { message: "Token expired" }
 *  TC93: Tampered token   → 401 { message: "Invalid token" }
 * ═══════════════════════════════════════════════════════════════
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // ─── TC91: Không có header → Missing token ─────────────────
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Missing token',
      errorCode: 'AUTH_006',
    });
  }

  try {
    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Invalid token',
        errorCode: 'AUTH_006',
      });
    }

    // ─── Kiểm tra Token Blacklist (Redis) ─────────────────────
    const path = require('path');
    const { getRedisClient } = require(path.resolve(__dirname, '../../../infra/redis/redisClient'));
    const redisClient = getRedisClient();
    const isBlacklisted = await redisClient.get(`token:blacklist:${token}`);

    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Token has been revoked (logged out)',
        errorCode: 'AUTH_008',
      });
    }

    // ─── TC92: Pre-check Token Expiration ─────────────────────
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          return res.status(401).json({ success: false, message: 'Token expired' });
        }
      }
    } catch (_) { /* ignore decode errors, let auth-service handle */ }

    // ─── Validate Token via Auth Service ──────────────────────
    const payload = await authService.validateToken(token);

    // payload.data contains the JWT decoded payload { sub, email, role }
    const decoded = payload.data || payload;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err) {
    // Axios error from auth-service — forward the structured error
    if (err.response && err.response.data) {
      const d = err.response.data;
      const msg = (d.message || '').toLowerCase();

      // TC92: Token Expired
      if (msg.includes('expired') || d.errorCode === 'AUTH_009') {
        return res.status(401).json({ success: false, message: 'Token expired' });
      }

      // TC93: Invalid signature / tampered
      if (msg.includes('invalid') || msg.includes('signature') || msg.includes('malform')) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }

      return res.status(err.response.status || 401).json(d);
    }

    // JWT local errors
    if (err.name === 'TokenExpiredError' || (err.message && err.message.toLowerCase().includes('expired'))) {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }

    if (err.name === 'JsonWebTokenError' || (err.message && err.message.toLowerCase().includes('invalid'))) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // TC93: Any other auth failure → Invalid token
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Invalid token',
      errorCode: 'AUTH_006',
    });
  }
}

/**
 * rolesMiddleware — TC95: RBAC Authorization
 *
 * Factory that returns Express middleware enforcing RBAC.
 * Must be used AFTER authMiddleware so req.user is populated.
 *
 * @param  {...string} roles  Allowed roles (e.g. 'ADMIN', 'DRIVER')
 */
function rolesMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Access denied: no role assigned',
        errorCode: 'AUTH_007',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: `Access denied: requires one of [${roles.join(', ')}]`,
        errorCode: 'AUTH_007',
      });
    }

    next();
  };
}

module.exports = { authMiddleware, rolesMiddleware };
