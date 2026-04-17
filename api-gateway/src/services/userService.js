const axios = require('axios');
const { SERVICE_URLS } = require('shared/constants');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');

const USER_BASE = SERVICE_URLS.USER_SERVICE;

const userClient = axios.create({
  baseURL: USER_BASE,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    'x-internal-token': INTERNAL_SECRET,
  },
});

async function getProfile(userId) {
  // Gửi internal traffic, nhét x-user-id header
  const res = await userClient.get(`/profile/${userId}`, {
    headers: { 'x-user-id': userId }
  });
  return res.data;
}

module.exports = {
  getProfile,
};
