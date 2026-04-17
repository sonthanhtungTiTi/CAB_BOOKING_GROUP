const { Router } = require('express');
const { authMiddleware, rolesMiddleware } = require('../middlewares/authMiddleware');
const paymentService = require('../services/paymentService');
const { UserRole } = require('shared/constants');

const router = Router();

// ─── POST /api/payments ──────────────────────────────────────
// Khách hàng tiến hành thanh toán cuốc xe
router.post('/', authMiddleware, rolesMiddleware(UserRole.CUSTOMER), async (req, res, next) => {
  try {
    const { bookingId, amount, paymentMethod } = req.body;
    
    // Ép buộc customerId bằng req.user.id từ Token (ngăn chặn thanh toán hộ/thay đổi)
    const customerId = req.user.id;

    console.log(`[Gateway] Customer ${customerId} initiating payment for booking ${bookingId}`);

    const result = await paymentService.processPayment(bookingId, customerId, amount, paymentMethod);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
