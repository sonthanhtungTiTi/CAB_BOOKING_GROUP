const DriverProfileModel = require('../models/driverProfileModel');
const { AppError } = require('shared/middlewares/errorHandler');
const { ERROR_CODES } = require('shared/constants');

async function getProfile(req, res, next) {
  try {
    const reqUserId = req.headers['x-user-id'] || req.query.userId || req.params.userId;
    
    if (!reqUserId) {
      throw new AppError('User ID is missing', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const profile = await DriverProfileModel.findByUserId(reqUserId);
    
    if (!profile) {
      throw new AppError('Driver profile not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    res.json(profile);
  } catch (err) {
    next(err);
  }
}

// ─── PUT /status — Cập nhật trạng thái tài xế ───────────────
async function updateStatus(req, res, next) {
  try {
    const { driver_id, status } = req.body;

    if (!driver_id || !status) {
      throw new AppError('driver_id and status are required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const validStatuses = ['ONLINE', 'OFFLINE', 'BUSY'];
    if (!validStatuses.includes(status)) {
      throw new AppError(
        `Invalid status: ${status}. Allowed: ${validStatuses.join(', ')}`,
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // TODO: Persist to Redis/DB khi có production logic
    console.log(`[Driver] ${driver_id} status → ${status}`);

    res.json({
      success: true,
      driver_id,
      status,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateStatus,
};
