const { Router } = require('express');
const { authMiddleware, rolesMiddleware } = require('../middlewares/authMiddleware');
const driverService = require('../services/driverService');
const { UserRole } = require('shared/constants');

const router = Router();

// ─── GET /api/drivers/profile (Protected Driver) ──
router.get('/profile', authMiddleware, rolesMiddleware(UserRole.DRIVER), async (req, res, next) => {
  try {
    console.log(`[Gateway] Profile request for Driver: ${req.user.id}`);
    const profile = await driverService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
