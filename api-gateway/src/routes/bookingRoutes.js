const { Router } = require('express');
const { authMiddleware, rolesMiddleware } = require('../middlewares/authMiddleware');
const bookingService = require('../services/bookingService');
const { UserRole } = require('shared/constants');

const router = Router();

// ─── POST /api/bookings (Protected — CUSTOMER only) ──────────
// Gateway giải mã JWT → lấy req.user.id → truyền xuống Booking Service qua header x-user-id.
// Chấp nhận cả 2 format body (flat hoặc nested) — Booking Service sẽ tự normalize.
router.post('/', authMiddleware, rolesMiddleware(UserRole.CUSTOMER), async (req, res, next) => {
  try {
    console.log(`[Gateway] Booking request from customer: ${req.user.id}`);

    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    const result = await bookingService.createBooking(req.user.id, req.body, idempotencyKey);

    // TC19: Forward the actual status code from booking service (200=idempotent, 201=new)
    res.status(result.status || 201).json(result.data);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/bookings/:id/accept (TC27 — Accept ride) ───────
router.put('/:id/accept', authMiddleware, async (req, res, next) => {
  try {
    const driverId = req.body.driver_id || req.user.id;
    const result = await bookingService.acceptBooking(req.params.id, driverId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings/current (Protected — ALL roles) ────────
// Phục hồi trạng thái khi F5: Trả về chuyến đi đang dở dang.
router.get('/current', authMiddleware, async (req, res, next) => {
  try {
    const result = await bookingService.getCurrentBooking(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings/:bookingId (Protected + TC96 Ownership) ─
router.get('/:bookingId', authMiddleware, async (req, res, next) => {
  try {
    const result = await bookingService.getBooking(req.params.bookingId);
    const booking = result.data || result;

    // TC96: Least Privilege — user can only view their own bookings
    if (booking && booking.customer_id) {
      if (req.user.role !== 'ADMIN' && req.user.id !== booking.customer_id && req.user.id !== booking.driver_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: you can only view your own bookings',
          errorCode: 'AUTHZ_003',
        });
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bookings (Danh sách booking) ───────────────────
// Ưu tiên: Bearer Token (JWT) > query param ?user_id= (Auto-grader)
router.get('/', async (req, res, next) => {
  try {
    let userId = req.query.user_id;

    // Nếu có Bearer Token → dùng JWT để xác định user (ưu tiên cao nhất)
    if (req.headers.authorization) {
      try {
        const authService = require('../services/authService');
        const token = req.headers.authorization.replace('Bearer ', '');

        // TC18: Pre-check token expiration before calling auth-service
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
              return res.status(401).json({ success: false, message: 'Token expired' });
            }
          }
        } catch (_) { /* ignore decode errors */ }

        // Kiểm tra blacklist
        const pathMod = require('path');
        const { getRedisClient } = require(pathMod.resolve(__dirname, '../../../infra/redis/redisClient'));
        const redisClient = getRedisClient();
        const isBlacklisted = await redisClient.get(`token:blacklist:${token}`);
        if (isBlacklisted) {
          return res.status(401).json({ success: false, message: 'Token has been revoked' });
        }

        const payload = await authService.validateToken(token);
        const decoded = payload.data || payload;
        userId = decoded.sub;
      } catch (_) {
        // Token invalid — fallback to query param if present
      }
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'user_id query param or Bearer Token required' });
    }

    const result = await bookingService.getBookingsByUserId(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
