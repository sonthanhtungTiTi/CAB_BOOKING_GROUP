const express = require('express');
const router = express.Router();
const { buildRideContext } = require('../services/contextBuilder');
const { selectBestDriver, recommendTopDrivers, orchestrateRide } = require('../services/aiAgent');

// ─── Constants ───────────────────────────────────────────────
const MODEL_VERSION = 'v1.0.0';
const DRIFT_TRAFFIC_THRESHOLD = 5.0;
const ETA_MIN = 0;
const ETA_MAX = 120; // minutes
const FALLBACK_ETA = 15; // minutes
const ETA_CACHE_TTL = 5; // seconds — TC66

// ─── TC66: Redis Cache for ETA ──────────────────────────────
let _redis = null;
let cacheHits = 0;
let cacheMisses = 0;

function getRedis() {
  if (_redis) return _redis;
  try {
    const path = require('path');
    const { getRedisClient } = require(path.resolve(__dirname, '../../../../infra/redis/redisClient'));
    _redis = getRedisClient();
    return _redis;
  } catch (_) {
    return null;
  }
}

// ─── TC66: Cache Stats Endpoint ──────────────────────────────
router.get('/cache-stats', (_req, res) => {
  const total = cacheHits + cacheMisses;
  const hitRate = total > 0 ? Math.round((cacheHits / total) * 10000) / 100 : 0;
  res.json({
    cache_hits: cacheHits,
    cache_misses: cacheMisses,
    total_requests: total,
    hit_rate_percent: hitRate,
    model_version: MODEL_VERSION,
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/eta — TC41, TC46, TC47, TC48, TC49, TC50
//
//  Input:  { distance_km, traffic_level }
//  Output: { eta, model_version }
//  Boundaries: eta > 0 && eta < 120 for realistic inputs
// ═══════════════════════════════════════════════════════════════
router.post('/eta', async (req, res) => {
  const { distance_km, traffic_level } = req.body;

  // TC50: Strict input validation — reject bad types BEFORE AI logic
  if (distance_km == null || traffic_level == null) {
    return res.status(400).json({
      success: false,
      message: 'distance_km and traffic_level are required',
    });
  }

  const dist = parseFloat(distance_km);
  const traffic = parseFloat(traffic_level);

  if (isNaN(dist) || isNaN(traffic)) {
    return res.status(400).json({
      success: false,
      message: 'distance_km and traffic_level must be valid numbers',
    });
  }

  // TC50: Negative distance → 400
  if (dist < 0) {
    return res.status(400).json({
      success: false,
      message: 'distance_km must be non-negative',
    });
  }

  // TC15: distance_km === 0 → eta = 0
  if (dist === 0) {
    return res.json({ eta: 0, model_version: MODEL_VERSION });
  }

  // TC66: Cache lookup (skip for simulated crashes)
  if (!req.body.simulate_model_crash) {
    const redis = getRedis();
    if (redis) {
      try {
        const cacheKey = `eta:${dist}:${traffic}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          cacheHits++;
          const parsed = JSON.parse(cached);
          return res.json({ ...parsed, cache_hit: true });
        }
      } catch (_) { /* Redis error → compute normally */ }
    }
    cacheMisses++;
  }

  // TC48: Drift Detection — traffic_level exceeding threshold
  if (traffic > DRIFT_TRAFFIC_THRESHOLD) {
    console.warn(`[MLOps WARNING] Data Drift Detected - traffic_level threshold exceeded (value=${traffic}, threshold=${DRIFT_TRAFFIC_THRESHOLD})`);
  }

  // TC49: Model logic wrapped in try/catch with fallback
  let eta;
  try {
    // TC49: Chaos Engineering — simulate_model_crash flag
    if (req.body.simulate_model_crash) {
      throw new Error('Simulated Internal AI Model Segment Fault');
    }

    // ETA formula: base speed 30 km/h, traffic multiplier increases time
    // Clamp traffic to [0, 0.95] to prevent division by near-zero
    const clampedTraffic = Math.min(Math.max(traffic, 0), 0.95);
    const baseSpeedKmh = 30;
    const effectiveSpeed = baseSpeedKmh * (1 - clampedTraffic * 0.5);
    eta = Math.round((dist / Math.max(effectiveSpeed, 0.1)) * 60 * 100) / 100;

    // TC41: Enforce boundaries
    eta = Math.max(ETA_MIN, Math.min(eta, ETA_MAX));
  } catch (err) {
    // TC49: Model crash → fallback (HTTP 200, system does NOT crash)
    console.error('[AI] Fallback triggered:', err.message);
    return res.json({
      eta: FALLBACK_ETA,
      model_version: MODEL_VERSION,
      is_fallback: true,
    });
  }

  // TC66: Write to cache
  const result = { eta, model_version: MODEL_VERSION };
  const redis = getRedis();
  if (redis) {
    try {
      const cacheKey = `eta:${dist}:${traffic}`;
      await redis.set(cacheKey, JSON.stringify(result), 'EX', ETA_CACHE_TTL);
    } catch (_) { /* Cache write failure is non-critical */ }
  }

  // TC46: Always include model_version
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/surge — TC42, TC46
//
//  Input:  { demand_index, supply_index }
//  Output: { surge, model_version }
// ═══════════════════════════════════════════════════════════════
router.post('/surge', (req, res) => {
  const { demand_index, supply_index } = req.body;

  if (demand_index == null || supply_index == null) {
    return res.status(400).json({
      success: false,
      message: 'demand_index and supply_index are required',
    });
  }

  const demand = parseFloat(demand_index);
  const supply = parseFloat(supply_index);

  if (isNaN(demand) || isNaN(supply)) {
    return res.status(400).json({
      success: false,
      message: 'demand_index and supply_index must be valid numbers',
    });
  }

  // TC42: surge = max(1.0, demand / supply)
  // Prevent division by zero
  const effectiveSupply = Math.max(supply, 0.01);
  const surge = Math.max(1.0, demand / effectiveSupply);

  res.json({
    surge: Math.round(surge * 100) / 100,
    demand_index: demand,
    supply_index: supply,
    model_version: MODEL_VERSION,
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/recommend — TC44
//
//  Input:  { drivers: [{ driver_id, distance_km, rating }], limit }
//  Output: { recommendations: [top 3 drivers], model_version }
// ═══════════════════════════════════════════════════════════════
router.post('/recommend', (req, res) => {
  const { drivers, limit } = req.body;

  if (!drivers || !Array.isArray(drivers)) {
    return res.status(400).json({
      success: false,
      message: 'drivers array is required',
    });
  }

  const top = recommendTopDrivers(drivers, limit || 3);

  res.json({
    recommendations: top,
    total_candidates: drivers.length,
    model_version: MODEL_VERSION,
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/fraud — TC43
//
//  Input:  { amount, user_id }
//  Output: { is_flagged, score, reason, model_version }
// ═══════════════════════════════════════════════════════════════
router.post('/fraud', (req, res) => {
  const { amount, user_id } = req.body;

  if (amount == null || !user_id) {
    return res.status(400).json({
      success: false,
      message: 'amount and user_id are required',
    });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({
      success: false,
      message: 'amount must be a valid number',
    });
  }

  // Heuristic fraud scoring (không dùng Math.random)
  let fraud_score = 0;
  let reason = 'Normal transaction';

  // Rule 1: Giao dịch > 5,000,000đ → fraud_score cao
  if (parsedAmount > 5000000) {
    fraud_score = 0.9;
    reason = 'Amount exceeds 5,000,000 VND threshold';
  }
  // Rule 2: Giao dịch > 2,000,000đ → medium risk
  else if (parsedAmount > 2000000) {
    fraud_score = 0.5;
    reason = 'Amount exceeds 2,000,000 VND — medium risk';
  }
  // Rule 3: Giao dịch bình thường
  else {
    fraud_score = 0.1;
    reason = 'Normal transaction within safe range';
  }

  const is_flagged = fraud_score > 0.8;

  res.json({
    is_flagged,
    score: fraud_score,
    amount: parsedAmount,
    user_id,
    reason,
    model_version: MODEL_VERSION,
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/ai/forecast — TC45
//
//  Output: { forecast: [{ time, predicted_demand }], model_version }
// ═══════════════════════════════════════════════════════════════
router.get('/forecast', (_req, res) => {
  // Deterministic demand forecast based on time-of-day pattern
  // Peak hours: 7-9 AM and 5-7 PM
  const forecast = [];
  for (let hour = 0; hour < 24; hour++) {
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    let predicted_demand;

    if (hour >= 7 && hour <= 9) {
      // Morning rush
      predicted_demand = 1.5 + (hour - 7) * 0.3;
    } else if (hour >= 17 && hour <= 19) {
      // Evening rush
      predicted_demand = 1.8 + (hour - 17) * 0.2;
    } else if (hour >= 11 && hour <= 14) {
      // Lunch
      predicted_demand = 1.2;
    } else if (hour >= 0 && hour <= 5) {
      // Late night / early morning
      predicted_demand = 0.3;
    } else {
      // Normal hours
      predicted_demand = 0.8;
    }

    forecast.push({
      time: timeStr,
      predicted_demand: Math.round(predicted_demand * 100) / 100,
    });
  }

  res.json({
    forecast,
    model_version: MODEL_VERSION,
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/context — TC23
// ═══════════════════════════════════════════════════════════════
router.post('/context', async (req, res) => {
  try {
    const context = await buildRideContext(req.body);
    res.json({ ...context, model_version: MODEL_VERSION });
  } catch (err) {
    console.error('[AI] Context build error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/match — TC28
// ═══════════════════════════════════════════════════════════════
router.post('/match', async (req, res) => {
  try {
    const context = await buildRideContext(req.body);
    const bestDriver = selectBestDriver(context);
    res.json({ context, selected_driver: bestDriver, model_version: MODEL_VERSION });
  } catch (err) {
    console.error('[AI] Match error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/ai/orchestrate — TC51-TC60 (Level 6: Agent Logic)
//
//  Input:  {
//    drivers: [{ driver_id, distance_km, rating, status, price? }],
//    distance_km, traffic_level,
//    simulate_agent_fail?: boolean  (TC60 Chaos flag)
//  }
//  Output: { selected_driver, eta, price, is_fallback,
//            decision_log, orchestration_steps, model_version }
// ═══════════════════════════════════════════════════════════════
router.post('/orchestrate', async (req, res) => {
  try {
    const { drivers, distance_km, traffic_level, simulate_agent_fail } = req.body;

    // Input validation
    if (!drivers || !Array.isArray(drivers)) {
      return res.status(400).json({
        success: false,
        message: 'drivers array is required',
      });
    }

    if (distance_km == null) {
      return res.status(400).json({
        success: false,
        message: 'distance_km is required',
      });
    }

    // TC54, TC56, TC57, TC58, TC60: Full Orchestration
    const result = await orchestrateRide({
      drivers,
      distance_km,
      traffic_level,
      simulate_agent_fail,
    });

    res.json(result);
  } catch (err) {
    console.error('[AI/Orchestrate] Unexpected error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
