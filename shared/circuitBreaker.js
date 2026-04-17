/**
 * ═══════════════════════════════════════════════════════════════
 *  circuitBreaker.js — TC72, TC75, TC77: Resilience Layer
 *
 *  Circuit Breaker (opossum) + Exponential Backoff (axios-retry)
 *  Wraps external service calls to prevent cascade failures.
 *
 *  States: CLOSED → OPEN → HALF-OPEN → CLOSED
 *    CLOSED:    Normal operation, requests pass through
 *    OPEN:      Too many failures, reject immediately → fallback
 *    HALF-OPEN: Test one request to see if service recovered
 * ═══════════════════════════════════════════════════════════════
 */
const CircuitBreaker = require('opossum');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// ─── TC77: Exponential Backoff Axios Client ─────────────────
const resilientAxios = axios.create({ timeout: 3000 });

axiosRetry(resilientAxios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay, // 100ms → 200ms → 400ms...
  retryCondition: (error) => {
    // Retry on network errors or 5xx server errors
    return axiosRetry.isNetworkOrIdempotentRequestError(error)
      || (error.response && error.response.status >= 500);
  },
  onRetry: (retryCount, error, requestConfig) => {
    console.log(`[RETRY] Attempt ${retryCount}/3 for ${requestConfig.url}: ${error.message}`);
  },
});

// ─── TC75: Circuit Breaker Factory ──────────────────────────
const breakers = {};

/**
 * Create or retrieve a named Circuit Breaker.
 *
 * @param {string} name - Unique name for the breaker (e.g. 'pricing', 'ai-eta')
 * @param {Function} fn - Async function to protect
 * @param {Function} fallbackFn - Fallback when circuit is OPEN
 * @param {Object} opts - Override default options
 */
function getBreaker(name, fn, fallbackFn, opts = {}) {
  if (breakers[name]) return breakers[name];

  const options = {
    timeout: 3000,             // If fn takes > 3s, count as failure
    errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
    resetTimeout: 10000,       // Try again after 10 seconds (HALF-OPEN)
    rollingCountTimeout: 10000, // Window of 10s to track failures
    rollingCountBuckets: 10,   // Split window into 10 buckets
    volumeThreshold: 5,        // Need at least 5 requests before opening
    ...opts,
  };

  const breaker = new CircuitBreaker(fn, options);

  // Register fallback
  breaker.fallback(fallbackFn);

  // Logging events
  breaker.on('open', () => {
    console.log(`[CIRCUIT BREAKER] 🔴 ${name} — OPENED (failures exceeded threshold)`);
  });
  breaker.on('halfOpen', () => {
    console.log(`[CIRCUIT BREAKER] 🟡 ${name} — HALF-OPEN (testing recovery)`);
  });
  breaker.on('close', () => {
    console.log(`[CIRCUIT BREAKER] 🟢 ${name} — CLOSED (recovered)`);
  });
  breaker.on('fallback', (result) => {
    console.log(`[CIRCUIT BREAKER] ⚡ ${name} — Fallback triggered`);
  });

  breakers[name] = breaker;
  return breaker;
}

/**
 * Get circuit breaker stats (for monitoring/testing)
 */
function getBreakerStats(name) {
  const breaker = breakers[name];
  if (!breaker) return null;
  return {
    name,
    state: breaker.opened ? 'OPEN' : (breaker.halfOpen ? 'HALF-OPEN' : 'CLOSED'),
    stats: {
      fires: breaker.stats.fires,
      successes: breaker.stats.successes,
      failures: breaker.stats.failures,
      fallbacks: breaker.stats.fallbacks,
      rejects: breaker.stats.rejects,
      timeouts: breaker.stats.timeouts,
    },
  };
}

/**
 * Reset all breakers (used in testing)
 */
function resetAllBreakers() {
  for (const name of Object.keys(breakers)) {
    breakers[name].close();
  }
}

module.exports = {
  resilientAxios,
  getBreaker,
  getBreakerStats,
  resetAllBreakers,
};
