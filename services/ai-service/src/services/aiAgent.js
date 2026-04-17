/**
 * ═══════════════════════════════════════════════════════════════════
 *  aiAgent.js — AI Agent Orchestrator (Level 6: TC51 → TC60)
 *
 *  Nguyên tắc: KHÔNG dùng Math.random(). Mọi quyết định dựa trên
 *  Toán học (Composite Score), Heuristics, và Orchestration Flow.
 *
 *  TC51-53: Composite Scoring (Distance + Rating + Price weights)
 *  TC54:    Tool Calling — sequential ETA → Pricing pipeline
 *  TC55:    Default Parameters for missing data (no NaN)
 *  TC56:    withRetry(fn, retries) utility
 *  TC57:    Filter Offline drivers BEFORE scoring
 *  TC58:    Decision Logging ([AGENT DECISION] in console + response)
 *  TC59:    Stateless — all variables scoped inside functions
 *  TC60:    Rule-based Fallback when Agent fails
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── Constants (Weights & Defaults) ──────────────────────────
const WEIGHT_DISTANCE = 0.4;
const WEIGHT_RATING   = 0.35;
const WEIGHT_PRICE    = 0.25;

const DEFAULT_RATING        = 3.0;
const DEFAULT_TRAFFIC_LEVEL = 0.3;
const DEFAULT_DISTANCE_KM   = 5.0;
const DEFAULT_PRICE         = 50000; // VND

const BASE_SPEED_KMH = 30;
const BASE_FARE_PER_KM = 10000; // VND

// ─── TC56: withRetry — retry wrapper (deterministic, no jitter) ─
async function withRetry(fn, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[AGENT RETRY] Attempt ${attempt + 1}/${retries + 1} failed: ${err.message}`);
    }
  }
  throw lastError;
}

// ─── TC54: Internal Tool — Calculate ETA ─────────────────────
function calculateETA(distance_km, traffic_level) {
  // TC55: Default parameters if missing
  const dist = parseFloat(distance_km) || DEFAULT_DISTANCE_KM;
  const traffic = parseFloat(traffic_level) ?? DEFAULT_TRAFFIC_LEVEL;
  const effectiveTraffic = isNaN(traffic) ? DEFAULT_TRAFFIC_LEVEL : traffic;

  // Clamp traffic to [0, 0.95]
  const clamped = Math.min(Math.max(effectiveTraffic, 0), 0.95);
  const speed = BASE_SPEED_KMH * (1 - clamped * 0.5);
  const etaMinutes = (dist / Math.max(speed, 0.1)) * 60;

  // Boundary: [1, 120]
  const eta = Math.max(1, Math.min(Math.round(etaMinutes * 100) / 100, 120));
  return eta;
}

// ─── TC54: Internal Tool — Calculate Pricing ─────────────────
function calculatePricing(distance_km, eta, traffic_level) {
  const dist = parseFloat(distance_km) || DEFAULT_DISTANCE_KM;
  const traffic = parseFloat(traffic_level) ?? DEFAULT_TRAFFIC_LEVEL;
  const effectiveTraffic = isNaN(traffic) ? DEFAULT_TRAFFIC_LEVEL : traffic;

  // Surge multiplier based on traffic
  const surgeFactor = 1 + Math.max(effectiveTraffic, 0) * 0.5;
  const price = Math.round(dist * BASE_FARE_PER_KM * surgeFactor);

  return price;
}

// ─── TC57: Filter Offline Drivers ────────────────────────────
function filterOnlineDrivers(drivers) {
  if (!drivers || !Array.isArray(drivers)) return [];
  return drivers.filter(d => {
    // If status is not provided (e.g. from Redis GEORADIUS), treat as ONLINE
    if (!d.status) return true;
    // Chỉ giữ tài xế ONLINE (case-insensitive)
    const status = d.status.toUpperCase();
    return status === 'ONLINE';
  });
}

// ─── TC51-53: Composite Score Calculation ────────────────────
//
//  Score = W_dist * NormDist + W_rating * NormRating + W_price * NormPrice
//
//  NormDist   = 1 / (distance + 0.1)  → gần hơn = điểm cao hơn
//  NormRating = rating / 5.0          → rating cao = điểm cao
//  NormPrice  = 1 / (price + 1)       → giá thấp = điểm cao (normalized)
//
function computeCompositeScore(driver, traffic_level) {
  // TC55: Safe defaults
  const distance = parseFloat(driver.distance_km) || DEFAULT_DISTANCE_KM;
  const rating   = parseFloat(driver.rating) ?? DEFAULT_RATING;
  const effectiveRating = isNaN(rating) ? DEFAULT_RATING : rating;
  const price    = parseFloat(driver.price) || DEFAULT_PRICE;

  // Normalized dimensions
  const normDistance = 1 / (distance + 0.1);
  const normRating   = effectiveRating / 5.0;
  const normPrice    = 1 / (price / 10000 + 1); // Normalize price to comparable scale

  const score = (WEIGHT_DISTANCE * normDistance)
              + (WEIGHT_RATING * normRating)
              + (WEIGHT_PRICE * normPrice);

  return {
    score: Math.round(score * 10000) / 10000,
    normDistance: Math.round(normDistance * 10000) / 10000,
    normRating: Math.round(normRating * 10000) / 10000,
    normPrice: Math.round(normPrice * 10000) / 10000,
  };
}

// ─── TC51-53, TC57, TC58: selectBestDriver (Enhanced) ────────
function selectBestDriver(context) {
  const { available_drivers, traffic_level } = context;

  if (!available_drivers || available_drivers.length === 0) {
    console.log('[AGENT DECISION] No drivers available — cannot select');
    return null;
  }

  // TC57: Filter offline drivers
  const onlineDrivers = filterOnlineDrivers(available_drivers);
  console.log(`[AGENT] Filtered ${available_drivers.length} → ${onlineDrivers.length} ONLINE drivers`);

  if (onlineDrivers.length === 0) {
    console.log('[AGENT DECISION] All drivers are OFFLINE — no selection possible');
    return null;
  }

  // TC51-53: Compute composite score for each online driver
  const scored = onlineDrivers.map(d => {
    const { score, normDistance, normRating, normPrice } = computeCompositeScore(d, traffic_level);
    const eta = calculateETA(d.distance_km, traffic_level);

    console.log(`[AGENT SCORE] Driver ${d.driver_id}: score=${score} (dist=${normDistance}, rating=${normRating}, price=${normPrice}), ETA=${eta}min`);

    return {
      driver_id: d.driver_id,
      distance_km: parseFloat(d.distance_km) || DEFAULT_DISTANCE_KM,
      rating: parseFloat(d.rating) || DEFAULT_RATING,
      status: d.status,
      score,
      eta,
    };
  });

  // Sort by composite score DESCENDING
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];

  // TC58: Decision Log
  const decisionLog = `[AGENT DECISION] Selected Driver ${best.driver_id}. Reason: Best composite score (${best.score}). ETA: ${best.eta}min, Distance: ${best.distance_km}km.`;
  console.log(decisionLog);

  return {
    driver_id: best.driver_id,
    distance_km: best.distance_km,
    rating: best.rating,
    score: best.score,
    eta: best.eta,
    decision_log: decisionLog,
    all_scores: scored,
  };
}

// ─── TC44: recommendTopDrivers (preserved from Level 5) ──────
function recommendTopDrivers(drivers, limit = 3) {
  if (!drivers || drivers.length === 0) return [];

  const scored = drivers.map(d => {
    const distance = parseFloat(d.distance_km) || 0;
    const rating = parseFloat(d.rating) || DEFAULT_RATING;
    const distanceScore = 1 / (distance + 0.1);
    const ratingScore = rating / 5.0;
    const compositeScore = distanceScore * 0.6 + ratingScore * 0.4;

    return {
      driver_id: d.driver_id,
      distance_km: distance,
      rating,
      score: Math.round(compositeScore * 10000) / 10000,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  console.log(`[AI/Agent] Top-${limit} recommendations: ${top.map(d => d.driver_id).join(', ')}`);
  return top;
}

// ─── TC54: orchestrateRide — Sequential Tool Calling ─────────
//
//  Pipeline: Intent → calculateETA() → calculatePricing() → selectBestDriver()
//
//  Agent gọi tuần tự: ETA trước, Pricing sau, cuối cùng pick driver.
//
async function orchestrateRide(input) {
  const {
    drivers,
    distance_km,
    traffic_level,
    simulate_agent_fail,
  } = input;

  // TC55: Default params
  const dist    = parseFloat(distance_km) || DEFAULT_DISTANCE_KM;
  const traffic = parseFloat(traffic_level) ?? DEFAULT_TRAFFIC_LEVEL;
  const effectiveTraffic = isNaN(traffic) ? DEFAULT_TRAFFIC_LEVEL : traffic;

  const steps = [];

  // ── Step 1: Calculate ETA (TC54 — Tool 1) ──────────────────
  const eta = calculateETA(dist, effectiveTraffic);
  steps.push({ tool: 'calculateETA', input: { distance_km: dist, traffic_level: effectiveTraffic }, output: { eta } });
  console.log(`[AGENT TOOL] Step 1 — calculateETA(${dist}km, traffic=${effectiveTraffic}) → ${eta} min`);

  // ── Step 2: Calculate Pricing using ETA (TC54 — Tool 2) ────
  const price = calculatePricing(dist, eta, effectiveTraffic);
  steps.push({ tool: 'calculatePricing', input: { distance_km: dist, eta, traffic_level: effectiveTraffic }, output: { price } });
  console.log(`[AGENT TOOL] Step 2 — calculatePricing(${dist}km, eta=${eta}, traffic=${effectiveTraffic}) → ${price} VND`);

  // ── Step 3: Select Best Driver (TC56/TC60 — with retry + fallback) ──
  let selectedDriver;
  let is_fallback = false;
  let decision_log;

  try {
    selectedDriver = await withRetry(async () => {
      // TC60: Simulate agent failure
      if (simulate_agent_fail) {
        throw new Error('Simulated Agent Internal Failure — service unavailable');
      }

      // TC57: Filter + TC51-53: Composite scoring
      const context = {
        available_drivers: (drivers || []).map(d => ({
          ...d,
          price: d.price || price, // inject computed price into context
        })),
        traffic_level: effectiveTraffic,
      };

      const result = selectBestDriver(context);
      if (!result) {
        throw new Error('No ONLINE drivers after filtering');
      }

      return result;
    }, 2);

    decision_log = selectedDriver.decision_log;
  } catch (err) {
    // TC60: Rule-based Fallback — pick first ONLINE driver
    console.error(`[AGENT FALLBACK] All retries exhausted: ${err.message}`);
    is_fallback = true;

    const onlineDrivers = filterOnlineDrivers(drivers || []);
    if (onlineDrivers.length > 0) {
      const fallbackDriver = onlineDrivers[0];
      selectedDriver = {
        driver_id: fallbackDriver.driver_id,
        distance_km: parseFloat(fallbackDriver.distance_km) || DEFAULT_DISTANCE_KM,
        rating: parseFloat(fallbackDriver.rating) || DEFAULT_RATING,
        score: 0,
        eta,
      };
      decision_log = `[AGENT DECISION] FALLBACK — Selected first ONLINE driver ${fallbackDriver.driver_id} (rule-based, agent failed).`;
    } else {
      selectedDriver = null;
      decision_log = '[AGENT DECISION] FALLBACK — No ONLINE drivers available, returning null.';
    }
    console.log(decision_log);
  }

  steps.push({
    tool: 'selectBestDriver',
    input: { driver_count: (drivers || []).length },
    output: { selected: selectedDriver?.driver_id || null, is_fallback },
  });

  return {
    selected_driver: selectedDriver,
    eta,
    price,
    is_fallback,
    decision_log,
    orchestration_steps: steps,
    model_version: 'v1.0.0',
  };
}

module.exports = {
  selectBestDriver,
  recommendTopDrivers,
  orchestrateRide,
  calculateETA,
  calculatePricing,
  filterOnlineDrivers,
  withRetry,
  computeCompositeScore,
  // Exported for testing
  WEIGHT_DISTANCE,
  WEIGHT_RATING,
  WEIGHT_PRICE,
  DEFAULT_RATING,
  DEFAULT_TRAFFIC_LEVEL,
};
