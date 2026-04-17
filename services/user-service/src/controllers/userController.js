const UserProfileModel = require('../models/userProfileModel');
const { AppError } = require('shared/middlewares/errorHandler');
const { ERROR_CODES } = require('shared/constants');

async function getProfile(req, res, next) {
  try {
    // Gateway truyền userId xuống qua headers or query, 
    // Theo chuẩn proxy Zero Trust, thông thường gateway nhét HTTP Header `x-user-id`
    const reqUserId = req.headers['x-user-id'] || req.query.userId || req.params.userId;
    
    if (!reqUserId) {
      throw new AppError('User ID is missing', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const profile = await UserProfileModel.findByUserId(reqUserId);
    
    if (!profile) {
      throw new AppError('Profile not found', 404, ERROR_CODES.USER_NOT_FOUND);
    }

    res.json(profile);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
};
