const mongoose = require('mongoose');

// ─── Review Schema ───────────────────────────────────────────
const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      required: [true, 'Booking ID is required'],
      unique: true, // Một booking chỉ được review một lần duy nhất
      index: true,
    },
    customerId: {
      type: String,
      required: [true, 'Customer ID is required'],
      index: true,
    },
    driverId: {
      type: String,
      required: [true, 'Driver ID is required'],
      index: true, // Index để truy vấn nhanh trung bình sao của tài xế
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer (1-5)',
      },
    },
    comment: {
      type: String,
      maxlength: [500, 'Comment must not exceed 500 characters'],
      default: '',
    },
  },
  {
    timestamps: true, // Tự động tạo createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Compound Index for fast driver stats aggregation ────────
reviewSchema.index({ driverId: 1, rating: 1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
