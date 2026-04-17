const axios = require('axios');
const { SERVICE_URLS } = require('shared/constants');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');

const BOOKING_BASE = SERVICE_URLS.BOOKING_SERVICE;

const bookingClient = axios.create({
  baseURL: BOOKING_BASE,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    'x-internal-token': INTERNAL_SECRET,
  },
});

// Gateway truyền userId qua header x-user-id (không qua body)
async function createBooking(userId, data, idempotencyKey) {
  const headers = { 'x-user-id': userId };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
    headers['x-idempotency-key'] = idempotencyKey;
  }
  const res = await bookingClient.post('/api/internal/bookings', data, { headers });
  return { data: res.data, status: res.status };
}

async function getBooking(bookingId) {
  const res = await bookingClient.get(`/api/internal/bookings/${bookingId}`);
  return res.data;
}

async function getCustomerBookings(customerId) {
  const res = await bookingClient.get(`/api/internal/bookings/customer/${customerId}`);
  return res.data;
}

async function updateBookingStatus(bookingId, status, driverId) {
  const res = await bookingClient.put(`/api/internal/bookings/${bookingId}/status`, {
    status,
    driverId,
  });
  return res.data;
}

async function getCurrentBooking(userId) {
  const res = await bookingClient.get('/api/internal/bookings/current', {
    params: { userId },
  });
  return res.data;
}

async function getBookingsByUserId(userId) {
  const res = await bookingClient.get('/api/internal/bookings', {
    params: { user_id: userId },
  });
  return res.data;
}

async function acceptBooking(bookingId, driverId) {
  const res = await bookingClient.put(`/api/internal/bookings/${bookingId}/accept`, {
    driver_id: driverId,
  });
  return res.data;
}

module.exports = {
  createBooking,
  getBooking,
  getCustomerBookings,
  updateBookingStatus,
  getCurrentBooking,
  getBookingsByUserId,
  acceptBooking,
};
