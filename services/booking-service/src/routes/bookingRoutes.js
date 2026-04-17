const { Router } = require('express');
const axios = require('axios');
const BookingModel = require('../models/bookingModel');
const { pool } = require('../db');
const { kafka } = require('shared');
const { KAFKA_TOPICS, ERROR_CODES, ALLOWED_TRANSITIONS } = require('shared/constants');
const { AppError } = require('shared/middlewares/errorHandler');
const { resilientAxios, getBreaker, getBreakerStats, resetAllBreakers } = require('shared/circuitBreaker');

const router = Router();

// ─── Service URLs ─────────────────────────────────────────────
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:4010';
const PRICING_SERVICE_URL = process.env.PRICING_SERVICE_URL || 'http://127.0.0.1:4006';
// Dead port for testing ECONNREFUSED
const DEAD_PORT_URL = 'http://127.0.0.1:59999';

// ─── Helper: Transform internal booking → API DTO ────────────
function toBookingDTO(booking) {
  return {
    booking_id: booking.id,
    customer_id: booking.customerId,
    status: booking.status,
    pickup: { lat: booking.pickupLat, lng: booking.pickupLng },
    drop: { lat: booking.destinationLat, lng: booking.destinationLng },
    driver_id: booking.driverId || null,
    created_at: booking.createdAt,
    updated_at: booking.updatedAt,
  };
}

function rowToBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    pickupLat: parseFloat(row.pickup_lat),
    pickupLng: parseFloat(row.pickup_lng),
    destinationLat: parseFloat(row.destination_lat),
    destinationLng: parseFloat(row.destination_lng),
    status: row.status,
    driverId: row.driver_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Helper: Get Redis client (safe, singleton) ──────────────
let _redisClient = null;
function getRedis() {
  if (_redisClient) return _redisClient;
  try {
    const { getRedisClient } = require('../../../../infra/redis/redisClient');
    _redisClient = getRedisClient();
    return _redisClient;
  } catch (_) {
    return null;
  }
}

// ─── TC75: Circuit Breaker — ETA Service ─────────────────────
const etaBreaker = getBreaker(
  'ai-eta',
  async ({ url, payload }) => {
    const res = await resilientAxios.post(`${url}/api/ai/eta`, payload);
    return res.data.data || res.data;
  },
  async ({ url, payload }) => {
    // Fallback: rule-based ETA
    const dist = payload.distance_km || 5;
    const eta = Math.round((dist / 30) * 60 * 100) / 100;
    console.log(`[CB FALLBACK] ETA fallback → ${eta} min (rule-based)`);
    return { eta, model_version: 'fallback', is_fallback: true, circuit_breaker: 'OPEN' };
  },
  { timeout: 3000, volumeThreshold: 3 },
);

// ─── TC75: Circuit Breaker — Pricing Service ─────────────────
const pricingBreaker = getBreaker(
  'pricing',
  async ({ url, payload }) => {
    const res = await resilientAxios.post(`${url}/api/pricing/calculate`, payload);
    return res.data.data || res.data;
  },
  async ({ url, payload }) => {
    // Fallback: rule-based pricing
    const dist = payload.distance_km || 5;
    const price = Math.round(15000 * dist);
    console.log(`[CB FALLBACK] Pricing fallback → ${price} VND (rule-based)`);
    return { price, surge: 1.0, is_fallback: true, circuit_breaker: 'OPEN' };
  },
  { timeout: 3000, volumeThreshold: 3 },
);

// ─── TC75: Circuit Breaker Stats Endpoint ────────────────────
router.get('/circuit-breaker/stats', (_req, res) => {
  res.json({
    breakers: {
      'ai-eta': getBreakerStats('ai-eta'),
      'pricing': getBreakerStats('pricing'),
    },
  });
});

// ─── TC75: Reset Breakers (for testing) ──────────────────────
router.post('/circuit-breaker/reset', (_req, res) => {
  resetAllBreakers();
  res.json({ success: true, message: 'All circuit breakers reset to CLOSED' });
});

// ═════════════════════════════════════════════════════════════
//  POST /api/internal/bookings
//
//  Luồng Production-Grade:
//    1. Atomic Idempotency Check (SETNX)
//    2. Validation
//    3. Gọi AI + Pricing (đồng bộ, có fallback)
//    4. ACID Transaction: BEGIN → INSERT bookings → INSERT outbox → COMMIT
//    5. Georadius check
//    6. Cache response + release lock
// ═════════════════════════════════════════════════════════════
router.post('/bookings', async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const redis = getRedis();
  let lockAcquired = false;
  const lockKey = idempotencyKey ? `idempotency:${idempotencyKey}` : null;

  try {
    // ═══════════════════════════════════════════════════════════
    //  BƯỚC 1: Atomic Idempotency — single SETNX, no GET-then-SET
    // ═══════════════════════════════════════════════════════════
    if (idempotencyKey) {
      // 1a. Atomic SETNX: NX = chỉ set nếu key chưa tồn tại
      if (redis) {
        try {
          const acquired = await redis.set(lockKey, 'PROCESSING', 'EX', 86400, 'NX');
          if (!acquired) {
            // Key đã tồn tại → request trước đã xử lý hoặc đang xử lý
            // Chờ ngắn rồi đọc kết quả đã cache
            await new Promise(r => setTimeout(r, 300));
            const cachedResult = await redis.get(lockKey);
            if (cachedResult && cachedResult !== 'PROCESSING') {
              console.log(`[Booking] Idempotency hit (SETNX): key=${idempotencyKey}`);
              return res.status(200).json(JSON.parse(cachedResult));
            }
            // Fallback: đọc DB (request trước có thể đã commit nhưng chưa cache)
            const existing = await BookingModel.findByIdempotencyKey(idempotencyKey);
            if (existing) {
              return res.status(200).json(toBookingDTO(existing));
            }
            // Request trước đang PROCESSING → trả duplicate detected
            return res.status(200).json({
              success: true, message: 'Duplicate request detected, processing.',
            });
          }
          lockAcquired = true;
        } catch (_) { /* Redis down → fallback to DB check */ }
      }

      // 1b. Fallback khi Redis không có: check DB unique constraint
      if (!lockAcquired) {
        const existing = await BookingModel.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          console.log(`[Booking] Idempotency hit (DB): Returned existing booking ${existing.id}`);
          return res.status(200).json(toBookingDTO(existing));
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  BƯỚC 2: Validation
    // ═══════════════════════════════════════════════════════════
    const customerId = req.headers['x-user-id'];
    if (!customerId) {
      throw new AppError('x-user-id header is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const { pickup, drop } = req.body;
    if (!pickup) return res.status(400).json({ success: false, message: 'pickup is required' });
    if (!drop) return res.status(400).json({ success: false, message: 'drop is required' });

    let pickupLat, pickupLng, destLat, destLng;
    const distanceKm = req.body.distance_km || req.body.distanceKm || null;

    if (pickup && drop) {
      pickupLat = pickup.lat;
      pickupLng = pickup.lng;
      destLat = drop.lat;
      destLng = drop.lng;
    } else {
      pickupLat = req.body.pickupLat;
      pickupLng = req.body.pickupLng;
      destLat = req.body.destLat;
      destLng = req.body.destLng;
    }

    if (typeof pickupLat !== 'number' || typeof pickupLng !== 'number' ||
        typeof destLat !== 'number' || typeof destLng !== 'number') {
      return res.status(422).json({
        success: false,
        message: 'Invalid coordinate format: lat and lng must be numbers',
      });
    }

    if (isNaN(pickupLat) || isNaN(pickupLng) || isNaN(destLat) || isNaN(destLng)) {
      return res.status(422).json({
        success: false,
        message: 'Invalid coordinate format: lat and lng must be valid numbers',
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  BƯỚC 3: Gọi AI + Pricing (trước khi mở Transaction)
    // ═══════════════════════════════════════════════════════════
    let eta = 0;
    let price = 0;
    let surge = 1.0;
    const dist = distanceKm ? parseFloat(distanceKm) : 5;

    // ─── TC71/75: Determine target URLs (simulate_network_fail → dead port) ───
    const aiUrl = req.body.simulate_network_fail ? DEAD_PORT_URL : AI_SERVICE_URL;
    const pricingUrl = req.body.simulate_network_fail ? DEAD_PORT_URL : PRICING_SERVICE_URL;

    // ─── TC75: Call AI ETA via Circuit Breaker ───────────────
    let etaFallback = false;
    const etaPayload = { distance_km: dist, traffic_level: 0.3 };
    const etaResult = await etaBreaker.fire({ url: aiUrl, payload: etaPayload });
    eta = etaResult.eta || 0;
    etaFallback = !!etaResult.is_fallback;
    console.log(`[Booking] AI ETA: ${eta} min${etaFallback ? ' (FALLBACK)' : ''}`);

    // ─── TC75: Call Pricing via Circuit Breaker ──────────────
    let priceFallback = false;
    const pricingPayload = { distance_km: dist, demand_index: 1.0, supply_index: 1.0 };
    if (req.body.simulate_timeout) pricingPayload.simulate_timeout = true;

    const pricingResult = await pricingBreaker.fire({ url: pricingUrl, payload: pricingPayload });
    price = pricingResult.price || 0;
    surge = pricingResult.surge || 1.0;
    priceFallback = !!pricingResult.is_fallback;
    console.log(`[Booking] Pricing: ${price} VND${priceFallback ? ' (FALLBACK)' : ''}`);

    // ═══════════════════════════════════════════════════════════
    //  BƯỚC 4: ACID Transaction — pool.connect() + BEGIN/COMMIT/ROLLBACK
    //  Tuyệt đối KHÔNG dùng pool.query('BEGIN')
    //  Client riêng → finally client.release()
    // ═══════════════════════════════════════════════════════════
    let booking;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 4a. INSERT booking
      const { rows } = await client.query(
        `INSERT INTO bookings
           (customer_id, pickup_lat, pickup_lng, destination_lat, destination_lng, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, 'REQUESTED', $6)
         RETURNING *`,
        [customerId, parseFloat(pickupLat), parseFloat(pickupLng),
         parseFloat(destLat), parseFloat(destLng), idempotencyKey || null],
      );
      booking = rowToBooking(rows[0]);

      // TC32: Simulate DB error BEFORE commit (rollback testing)
      if (req.body.simulate_db_error) {
        throw new Error('SIMULATED_DB_ERROR: Rollback triggered before COMMIT');
      }

      // 4b. TC38: INSERT outbox event (cùng transaction — atomic với booking)
      await client.query(
        `INSERT INTO outbox_events (topic, payload) VALUES ($1, $2)`,
        ['ride_events', JSON.stringify({
          event_type: 'ride_requested',
          ride_id: booking.id,
          user_id: customerId,
          pickup: { lat: booking.pickupLat, lng: booking.pickupLng },
          timestamp: new Date().toISOString(),
        })],
      );

      await client.query('COMMIT');
      console.log(`[Booking] TX COMMITTED: booking=${booking.id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Booking] TX ROLLED BACK: ${err.message}`);
      throw err; // re-throw → outer catch xử lý response
    } finally {
      client.release(); // QUAN TRỌNG: release connection về pool
    }

    console.log(`[Booking] Created: ${booking.id} | Customer: ${customerId} | Status: ${booking.status}`);

    // ═══════════════════════════════════════════════════════════
    //  BƯỚC 5: Georadius Check (sau transaction, non-critical)
    // ═══════════════════════════════════════════════════════════
    if (pickupLng !== undefined && pickupLat !== undefined && redis) {
      try {
        const keyExists = await redis.exists('driver_locations');
        if (keyExists) {
          const driversInArea = await redis.georadius('driver_locations', pickupLng, pickupLat, 10, 'km');
          if (!driversInArea || driversInArea.length === 0) {
            await BookingModel.updateStatus(booking.id, 'FAILED');
            return res.status(200).json({
              booking_id: booking.id,
              status: 'FAILED',
              message: 'No drivers available',
            });
          }
          console.log(`[Booking] Found ${driversInArea.length} driver(s) within 10km`);
        }
      } catch (err) {
        console.error('[Booking] Geo check error:', err.message);
      }
    }

    // Publish to ride.created (outbox handles ride_events)
    try {
      await kafka.publishEvent(KAFKA_TOPICS.RIDE_CREATED, {
        bookingId: booking.id,
        customerId: booking.customerId,
        pickupLat: booking.pickupLat,
        pickupLng: booking.pickupLng,
        destinationLat: booking.destinationLat,
        destinationLng: booking.destinationLng,
        distanceKm,
        status: booking.status,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Booking] Failed to publish ride.created:', err.message);
    }

    // ═══════════════════════════════════════════════════════════
    //  BƯỚC 6: Build response + cache + release lock
    // ═══════════════════════════════════════════════════════════
    const responseData = {
      ...toBookingDTO(booking),
      distance_km: distanceKm,
      eta,
      price,
      surge,
      // TC71/75: Fallback metadata
      fallback_triggered: etaFallback || priceFallback,
      ...(etaFallback && { eta_fallback: true }),
      ...(priceFallback && { price_fallback: true }),
    };

    // Cache kết quả vào cùng lockKey (overwrite 'PROCESSING' → JSON result)
    if (idempotencyKey && redis) {
      try {
        await redis.set(lockKey, JSON.stringify(responseData), 'EX', 86400);
      } catch (_) { /* Redis optional */ }
    }

    res.status(201).json(responseData);
  } catch (err) {
    // TC32: If simulated DB error → return 500
    if (err.message && err.message.includes('SIMULATED_DB_ERROR')) {
      // Cleanup Redis lock khi transaction rollback
      if (lockAcquired && redis && lockKey) {
        try { await redis.del(lockKey); } catch (_) {}
      }
      return res.status(500).json({
        success: false,
        message: 'Transaction rolled back',
        error: err.message,
      });
    }
    next(err);
  }
});

// ─── PUT /api/internal/bookings/:id/accept — TC27 ────────────
router.put('/bookings/:id/accept', async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { driver_id } = req.body;

    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, ERROR_CODES.BOOKING_NOT_FOUND);
    }

    const updated = await BookingModel.updateStatus(bookingId, 'ACCEPTED', driver_id);
    console.log(`[Booking] Accepted: ${bookingId} by driver ${driver_id}`);

    try {
      await kafka.publishEvent('ride_events', {
        event_type: 'ride_accepted',
        ride_id: bookingId,
        driver_id: driver_id,
        user_id: booking.customerId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Booking] Failed to publish ride_accepted:', err.message);
    }

    res.json({
      booking_id: updated.id,
      status: updated.status,
      driver_id: updated.driverId || driver_id,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/internal/bookings/:id/status ───────────────────
router.put('/bookings/:id/status', async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const { status, driverId } = req.body;

    if (!status || !driverId) {
      throw new AppError('status and driverId are required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const booking = await BookingModel.findById(bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, ERROR_CODES.BOOKING_NOT_FOUND);
    }

    if (booking.driverId !== driverId) {
      throw new AppError('You are not the assigned driver for this booking', 403, ERROR_CODES.DRIVER_MISMATCH);
    }

    const allowed = ALLOWED_TRANSITIONS[booking.status];
    if (!allowed || !allowed.includes(status)) {
      throw new AppError(
        `Invalid transition: ${booking.status} → ${status}. Allowed: ${(allowed || []).join(', ') || 'none'}`,
        400,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const updated = await BookingModel.updateStatus(bookingId, status);
    console.log(`[Booking] Status updated: ${bookingId} | ${booking.status} → ${status}`);

    try {
      await kafka.publishEvent(KAFKA_TOPICS.RIDE_STATUS_UPDATED, {
        bookingId: updated.id,
        status: updated.status,
        customerId: updated.customerId,
        driverId: updated.driverId,
        pickupLat: updated.pickupLat,
        pickupLng: updated.pickupLng,
        destinationLat: updated.destinationLat,
        destinationLng: updated.destinationLng,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Booking] Failed to publish ride.status.updated:', err.message);
    }

    res.json(toBookingDTO(updated));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/internal/bookings/current ───────────────────────
router.get('/bookings/current', async (req, res, next) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      throw new AppError('userId query param is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    const booking = await BookingModel.findCurrentByUserId(userId);
    res.json(booking ? toBookingDTO(booking) : null);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/internal/bookings/:bookingId ───────────────────
router.get('/bookings/:bookingId', async (req, res, next) => {
  try {
    const booking = await BookingModel.findById(req.params.bookingId);
    if (!booking) {
      throw new AppError('Booking not found', 404, ERROR_CODES.BOOKING_NOT_FOUND);
    }
    res.json(toBookingDTO(booking));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/internal/bookings/customer/:customerId ─────────
router.get('/bookings/customer/:customerId', async (req, res, next) => {
  try {
    const bookings = await BookingModel.findByCustomerId(req.params.customerId);
    res.json(bookings.map(toBookingDTO));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/internal/bookings — Danh sách booking ──────────
router.get('/bookings', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.user_id;
    if (!userId) {
      throw new AppError('user_id is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }
    const bookings = await BookingModel.findByCustomerId(userId);
    res.json(bookings.map(b => ({ booking_id: b.id, status: b.status })));
  } catch (err) {
    next(err);
  }
});

// ─── Health Check ────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'booking-service', timestamp: new Date().toISOString() });
});

module.exports = router;
