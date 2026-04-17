const { Router } = require('express');
const { authMiddleware, rolesMiddleware } = require('../middlewares/authMiddleware');
const reviewService = require('../services/reviewService');
const { UserRole } = require('shared/constants');

const router = Router();

// ─── POST /api/reviews (Protected — CUSTOMER only) ───────────
// Khách hàng gửi đánh giá cho tài xế sau chuyến đi.
// Gateway inject customerId từ JWT token vào x-user-id header.
router.post('/', authMiddleware, rolesMiddleware(UserRole.CUSTOMER), async (req, res, next) => {
  try {
    const { bookingId, driverId, rating, comment } = req.body;

    console.log(`[Gateway] Review request from customer: ${req.user.id}`);

    const result = await reviewService.createReview(
      { bookingId, driverId, rating, comment },
      req.user.id
    );

    res.status(201).json(result);
  } catch (err) {
    // Forward structured error from review-service
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── GET /api/reviews/driver/:driverId (Protected — ALL) ─────
// Mọi user đã login đều có thể xem đánh giá của tài xế.
router.get('/driver/:driverId', authMiddleware, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await reviewService.getDriverReviews(
      req.params.driverId,
      { page, limit }
    );
    res.json(result);
  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

// ─── GET /api/reviews/stats/:driverId (Protected — ALL) ──────
// Trả về số sao trung bình và phân phối đánh giá của tài xế.
router.get('/stats/:driverId', authMiddleware, async (req, res, next) => {
  try {
    const result = await reviewService.getDriverStats(req.params.driverId);
    res.json(result);
  } catch (err) {
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    next(err);
  }
});

module.exports = router;
