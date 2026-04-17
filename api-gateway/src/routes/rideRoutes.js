const { Router } = require('express');
const { authMiddleware, rolesMiddleware } = require('../middlewares/authMiddleware');
const bookingService = require('../services/bookingService');
const { UserRole } = require('shared/constants');

const router = Router();

// ─── PUT /api/rides/:id/status (Protected — DRIVER only) ─────
// Driver cập nhật trạng thái chuyến đi (ASSIGNED → PICKUP → IN_PROGRESS → COMPLETED)
router.put('/:id/status', authMiddleware, rolesMiddleware(UserRole.DRIVER), async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { status } = req.body;

    console.log(`[Gateway] Driver ${req.user.id} updating ride ${bookingId} status to ${status}`);

    // Truyền req.user.id (driverId) xuống booking-service để đảm bảo 
    // chỉ chính tài xế đang giữ cuốc này mới được quyền cập nhật
    const result = await bookingService.updateBookingStatus(bookingId, status, req.user.id);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
