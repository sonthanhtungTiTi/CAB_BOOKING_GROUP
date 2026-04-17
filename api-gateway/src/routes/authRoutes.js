const { Router } = require('express');
const authService = require('../services/authService');

const router = Router();

// ─── POST /api/auth/register (Public) ────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login (Public) ───────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/refresh (Public) ─────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/logout (Protected) ───────────────────────
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(400).json({ success: false, message: 'Authorization header required' });
    }
    const token = authHeader.replace('Bearer ', '');
    const result = await authService.logout(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
