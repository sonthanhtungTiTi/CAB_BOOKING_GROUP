const { Router } = require('express');
const driverController = require('../controllers/driverController');

const router = Router();

router.get('/profile/:userId', driverController.getProfile);
router.get('/profile', driverController.getProfile);
router.put('/status', driverController.updateStatus);

module.exports = router;
