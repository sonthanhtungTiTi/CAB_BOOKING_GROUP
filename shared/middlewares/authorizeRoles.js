/**
 * ═══════════════════════════════════════════════════════════════
 *  authorizeRoles.js — TC89: Role-Based Access Control (RBAC)
 *
 *  Factory middleware: chỉ cho phép các role được chỉ định.
 *  PHẢI chạy SAU authMiddleware (req.user.role phải có).
 *
 *  Usage: router.post('/bookings', authMiddleware, authorizeRoles('CUSTOMER'), handler)
 * ═══════════════════════════════════════════════════════════════
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: 'Access denied: no role assigned',
        errorCode: 'AUTHZ_001',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        message: `Forbidden: requires role [${allowedRoles.join(', ')}], your role is [${req.user.role}]`,
        errorCode: 'AUTHZ_002',
      });
    }

    next();
  };
}

module.exports = { authorizeRoles };
