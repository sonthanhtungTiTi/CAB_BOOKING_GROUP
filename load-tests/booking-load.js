/**
 * ═══════════════════════════════════════════════════════════════
 *  booking-load.js — k6 Load Test (TC61, TC68)
 *
 *  Mục tiêu:
 *    TC61: API /api/ai/eta chịu được 1000 RPS (ramp-up VUs)
 *    TC68: P95 latency < 300ms cho ETA endpoint
 *
 *  Chạy: k6 run load-tests/booking-load.js
 * ═══════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom Metrics ──────────────────────────────────────────
const errorRate = new Rate('errors');
const etaLatency = new Trend('eta_latency', true);

// ─── Load Profile ────────────────────────────────────────────
//  Ramp up to ~200 VUs (each VU fires rapidly → ~1000 RPS)
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Warm up
    { duration: '1m',  target: 200 },  // Ramp to peak
    { duration: '2m',  target: 200 },  // Sustain peak
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    // TC68: P95 latency must be under 300ms
    'http_req_duration': ['p(95)<300'],
    // TC61: Error rate must be under 5%
    'errors': ['rate<0.05'],
    // Custom ETA latency
    'eta_latency': ['p(95)<300'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';

// ─── Deterministic test data ─────────────────────────────────
const distances = [3, 5, 8, 10, 15, 20, 25, 30, 40, 50];
const trafficLevels = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

export default function () {
  // Pick test data based on VU iteration (deterministic, no Math.random)
  const dist = distances[__ITER % distances.length];
  const traffic = trafficLevels[__ITER % trafficLevels.length];

  const payload = JSON.stringify({
    distance_km: dist,
    traffic_level: traffic,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  // ── Fire ETA request ───────────────────────────────────────
  const res = http.post(`${BASE_URL}/api/eta`, payload, params);

  etaLatency.add(res.timings.duration);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'eta is present': (r) => {
      const body = r.json();
      const data = body.data || body;
      return data.eta !== undefined && data.eta > 0;
    },
    'model_version present': (r) => {
      const body = r.json();
      const data = body.data || body;
      return data.model_version !== undefined;
    },
    'latency < 300ms': (r) => r.timings.duration < 300,
  });

  errorRate.add(!success);

  // Minimal sleep to maintain high RPS
  sleep(0.1);
}

// ─── Summary Report ──────────────────────────────────────────
export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 'N/A';
  const errRate = data.metrics.errors?.values?.rate || 0;
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  📊 BOOKING LOAD TEST RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Total Requests:  ${totalReqs}`);
  console.log(`  P95 Latency:     ${typeof p95 === 'number' ? p95.toFixed(2) : p95}ms`);
  console.log(`  Error Rate:      ${(errRate * 100).toFixed(2)}%`);
  console.log(`  TC61:            ${errRate < 0.05 ? '✅ PASS' : '❌ FAIL'} (errors < 5%)`);
  console.log(`  TC68:            ${typeof p95 === 'number' && p95 < 300 ? '✅ PASS' : '❌ FAIL'} (p95 < 300ms)`);
  console.log('═══════════════════════════════════════════════════');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
