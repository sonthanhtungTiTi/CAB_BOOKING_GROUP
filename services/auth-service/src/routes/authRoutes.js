const { Router } = require('express');
const authController = require('../controllers/authController');

const router = Router();

// ─── POST /register ──────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, role, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Email and password are required',
        errorCode: 'VAL_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }
    const result = await authController.register({ email, password, role, name });
    res.status(201).json({
      ...result,
      user_id: result.user.id,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /logout (Token Blacklist via Redis) ────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(400).json({ success: false, message: 'Authorization header required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const result = await authController.logout(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /login ─────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Email and password are required',
        errorCode: 'VAL_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }
    const result = await authController.login({ email, password });
    res.json({
      ...result,
      access_token: result.tokens.accessToken,
      user_id: result.user.id,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /validate-token ────────────────────────────────────
router.post('/validate-token', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Token is required',
        errorCode: 'VAL_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }
    const payload = await authController.validateToken(token);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ─── POST /refresh ───────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Refresh token is required',
        errorCode: 'VAL_001',
        errors: null,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
      });
    }
    const result = await authController.refreshToken({ refreshToken });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /profile/:userId ────────────────────────────────────
router.get('/profile/:userId', async (req, res, next) => {
  try {
    const profile = await authController.getProfile(req.params.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// ─── GET /health ─────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

module.exports = router;
