const axios = require('axios');
const { SERVICE_URLS } = require('shared/constants');
const { INTERNAL_SERVICE_TOKEN } = require('shared/middlewares/zeroTrustMiddleware');
const { INTERNAL_SECRET } = require('shared/middlewares/verifyInternalRequest');

const AUTH_BASE = SERVICE_URLS.AUTH_SERVICE;

/**
 * Create an axios instance with defaults for calling the Auth Service.
 */
const authClient = axios.create({
  baseURL: AUTH_BASE,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
    'x-internal-service-token': INTERNAL_SERVICE_TOKEN,
    'x-internal-token': INTERNAL_SECRET,
  },
});

async function register(data) {
  const res = await authClient.post('/register', data);
  return res.data;
}

async function login(data) {
  const res = await authClient.post('/login', data);
  return res.data;
}

async function refresh(data) {
  const res = await authClient.post('/refresh', data);
  return res.data;
}

async function validateToken(token) {
  const res = await authClient.post('/validate-token', { token });
  return res.data;
}

async function getProfile(userId) {
  const res = await authClient.get(`/profile/${userId}`);
  return res.data;
}

async function logout(token) {
  const res = await authClient.post('/logout', {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

module.exports = {
  register,
  login,
  refresh,
  validateToken,
  getProfile,
  logout,
};
