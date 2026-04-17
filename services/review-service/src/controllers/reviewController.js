const Review = require('../models/Review');

// ─── POST /api/reviews ───────────────────────────────────────
// Tạo đánh giá cho một chuyến đi.
// customerId được inject từ gateway (JWT).
// bookingId + driverId đi kèm trong body.
async function createReview(req, res) {
  try {
    const { bookingId, driverId, rating, comment } = req.body;
    const customerId = req.headers['x-user-id']; // Injected by API Gateway

    // ─── Validation ──────────────────────────────────────────
    if (!bookingId || !driverId || rating == null) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'bookingId, driverId, and rating are required',
        errorCode: 'VAL_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }

    if (!customerId) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        message: 'Authentication required',
        errorCode: 'AUTH_006',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }

    // ─── Check duplicate review (unique bookingId) ───────────
    const existingReview = await Review.findOne({ bookingId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        statusCode: 409,
        message: 'This booking has already been reviewed',
        errorCode: 'REVIEW_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }

    // ─── Create review ──────────────────────────────────────
    const review = await Review.create({
      bookingId,
      customerId,
      driverId,
      rating,
      comment: comment || '',
    });

    console.log(`[review-service] New review created: booking=${bookingId}, rating=${rating}`);

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'Review created successfully',
      data: review,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Mongoose duplicate key error (backup for race conditions)
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        statusCode: 409,
        message: 'This booking has already been reviewed',
        errorCode: 'REVIEW_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: messages.join('. '),
        errorCode: 'VAL_001',
        errors: messages,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }

    console.error('[review-service] Error creating review:', err);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errorCode: 'SYS_001',
      errors: null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
}

// ─── GET /api/reviews/driver/:driverId ───────────────────────
// Lấy danh sách đánh giá của một tài xế (phân trang).
async function getDriverReviews(req, res) {
  try {
    const { driverId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ driverId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ driverId }),
    ]);

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Driver reviews retrieved successfully',
      data: {
        reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[review-service] Error fetching driver reviews:', err);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errorCode: 'SYS_001',
      errors: null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
}

// ─── GET /api/reviews/stats/:driverId ────────────────────────
// Trả về thống kê trung bình sao và tổng số đánh giá.
async function getDriverStats(req, res) {
  try {
    const { driverId } = req.params;

    const [stats] = await Review.aggregate([
      { $match: { driverId } },
      {
        $group: {
          _id: '$driverId',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratingDistribution: {
            $push: '$rating',
          },
        },
      },
    ]);

    if (!stats) {
      return res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'No reviews found for this driver',
        data: {
          driverId,
          averageRating: 0,
          totalReviews: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Tính phân phối rating (1-5 sao)
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    stats.ratingDistribution.forEach((r) => {
      distribution[r] = (distribution[r] || 0) + 1;
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Driver stats retrieved successfully',
      data: {
        driverId,
        averageRating: Math.round(stats.averageRating * 100) / 100, // 2 chữ số thập phân
        totalReviews: stats.totalReviews,
        distribution,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[review-service] Error fetching driver stats:', err);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errorCode: 'SYS_001',
      errors: null,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
    });
  }
}

module.exports = {
  createReview,
  getDriverReviews,
  getDriverStats,
};
