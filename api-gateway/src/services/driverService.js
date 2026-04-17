const axios = require('axios');
const { SERVICE_URLS } = require('shared/constants');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');

const DRIVER_BASE = SERVICE_URLS.DRIVER_SERVICE;

const driverClient = axios.create({
  baseURL: DRIVER_BASE,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    'x-internal-token': INTERNAL_SECRET,
  },
});

async function getProfile(userId) {
  // Gửi internal traffic, nhét x-user-id header
  const res = await driverClient.get(`/profile/${userId}`, {
    headers: { 'x-user-id': userId }
  });
  return res.data;
}

module.exports = {
  getProfile,
};
