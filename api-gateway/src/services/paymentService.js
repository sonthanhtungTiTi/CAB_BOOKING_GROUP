const axios = require('axios');
const { SERVICE_URLS } = require('shared/constants');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');

const paymentClient = axios.create({
  baseURL: SERVICE_URLS.PAYMENT_SERVICE,
  timeout: 5000,
  headers: {
    'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    'x-internal-token': INTERNAL_SECRET,
  },
});

async function processPayment(bookingId, customerId, amount, paymentMethod) {
  const res = await paymentClient.post('/api/internal/payments', {
    bookingId,
    customerId,
    amount,
    paymentMethod,
  });
  return res.data;
}

module.exports = {
  processPayment,
};
