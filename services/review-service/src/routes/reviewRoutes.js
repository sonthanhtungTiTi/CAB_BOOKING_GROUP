const { Router } = require('express');
const {
  createReview,
  getDriverReviews,
  getDriverStats,
} = require('../controllers/reviewController');

const router = Router();

// ─── POST /api/reviews ─── Tạo review cho một chuyến đi ─────
router.post('/', createReview);

// ─── GET /api/reviews/driver/:driverId ─── Danh sách đánh giá ─
router.get('/driver/:driverId', getDriverReviews);

// ─── GET /api/reviews/stats/:driverId ─── Thống kê trung bình ─
router.get('/stats/:driverId', getDriverStats);

module.exports = router;
