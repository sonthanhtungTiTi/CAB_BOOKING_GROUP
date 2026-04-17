const { Router } = require('express');
const locationService = require('../services/locationService');
const { AppError } = require('shared/middlewares/errorHandler');
const { ERROR_CODES } = require('shared/constants');

const router = Router();

// ─── POST /api/internal/locations ────────────────────────────
// Nhận tọa độ GPS từ Gateway (internal call).
// Body: { driverId, lat, lng }
router.post('/locations', async (req, res, next) => {
  try {
    const { driverId, lat, lng } = req.body;

    if (!driverId || lat == null || lng == null) {
      throw new AppError(
        'driverId, lat, and lng are required',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new AppError(
        'Invalid coordinates: lat must be [-90,90], lng must be [-180,180]',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const result = await locationService.updateDriverLocation(driverId, lat, lng);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/internal/locations/nearby ──────────────────────
// Tìm các tài xế trong bán kính.
// Query: ?lat=...&lng=...&radius=5  (radius mặc định 5km)
router.get('/locations/nearby', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radius = parseFloat(req.query.radius) || 5;

    if (isNaN(lat) || isNaN(lng)) {
      throw new AppError(
        'lat and lng query parameters are required and must be numbers',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const drivers = await locationService.findNearbyDrivers(lat, lng, radius);
    res.json(drivers);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/internal/locations/:driverId ────────────────
// Xóa vị trí khi tài xế offline.
router.delete('/locations/:driverId', async (req, res, next) => {
  try {
    const result = await locationService.removeDriverLocation(req.params.driverId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Health Check ────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ride-service', timestamp: new Date().toISOString() });
});

module.exports = router;
