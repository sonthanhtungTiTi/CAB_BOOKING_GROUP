const axios = require('axios');
const { SERVICE_URLS } = require('shared/constants');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');

const REVIEW_BASE = SERVICE_URLS.REVIEW_SERVICE;

/**
 * Create an axios instance for calling the Review Service.
 */
const reviewClient = axios.create({
  baseURL: REVIEW_BASE,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    'x-internal-token': INTERNAL_SECRET,
  },
});

/**
 * Tạo review cho một chuyến đi.
 * @param {object} data - { bookingId, driverId, rating, comment }
 * @param {string} customerId - ID khách hàng (từ JWT)
 */
async function createReview(data, customerId) {
  const res = await reviewClient.post('/api/internal/reviews', data, {
    headers: { 'x-user-id': customerId },
  });
  return res.data;
}

/**
 * Lấy danh sách đánh giá của tài xế (có phân trang).
 * @param {string} driverId
 * @param {object} query - { page, limit }
 */
async function getDriverReviews(driverId, query = {}) {
  const res = await reviewClient.get(`/api/internal/reviews/driver/${driverId}`, {
    params: query,
  });
  return res.data;
}

/**
 * Lấy thống kê trung bình sao của tài xế.
 * @param {string} driverId
 */
async function getDriverStats(driverId) {
  const res = await reviewClient.get(`/api/internal/reviews/stats/${driverId}`);
  return res.data;
}

module.exports = {
  createReview,
  getDriverReviews,
  getDriverStats,
};
