const { Router } = require('express');
const { authMiddleware, rolesMiddleware } = require('../middlewares/authMiddleware');
const userService = require('../services/userService');
const { UserRole } = require('shared/constants');

const router = Router();

// ─── GET /api/users/profile (Protected Customer) ──
router.get('/profile', authMiddleware, rolesMiddleware(UserRole.CUSTOMER), async (req, res, next) => {
  try {
    console.log(`[Gateway] Profile request for Customer: ${req.user.id}`);
    const profile = await userService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
