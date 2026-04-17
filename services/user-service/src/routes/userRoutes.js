const { Router } = require('express');
const userController = require('../controllers/userController');

const router = Router();

// Lấy thông tin qua ID param. Hoặc Gateway tự động gửi X-User-Id header.
router.get('/profile/:userId', userController.getProfile);
router.get('/profile', userController.getProfile); // Hỗ trợ trường hợp Gateway map id vào req.headers['x-user-id']

module.exports = router;
