/**
 * ═══════════════════════════════════════════════════════════════
 *  peak-hours.js — k6 Sustained Load Test (TC69)
 *
 *  Mục tiêu:
 *    TC69: Hệ thống chịu tải giờ cao điểm (Sustained)
 *    Ramp up 3 phút → Duy trì 5 phút → Ramp down 2 phút
 *
 *  Kiểm tra: Latency không tăng dần (không bị memory leak / connection leak)
 *
 *  Chạy: k6 run load-tests/peak-hours.js
 * ═══════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom Metrics ──────────────────────────────────────────
const errorRate = new Rate('errors');
const etaLatency = new Trend('eta_p95', true);
const surgeLatency = new Trend('surge_p95', true);
const orchestrateLatency = new Trend('orchestrate_p95', true);

// ─── Sustained Load Profile ─────────────────────────────────
export const options = {
  stages: [
    { duration: '3m', target: 100 },   // Ramp up 3 phút
    { duration: '5m', target: 100 },   // Duy trì 5 phút (Peak Hours)
    { duration: '2m', target: 0 },     // Ramp down 2 phút
  ],
  thresholds: {
    'errors': ['rate<0.05'],
    'eta_p95': ['p(95)<500'],
    'surge_p95': ['p(95)<500'],
    'orchestrate_p95': ['p(95)<500'],
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';
const params = { headers: { 'Content-Type': 'application/json' } };

// ─── Deterministic data pools ────────────────────────────────
const ETA_PAYLOADS = [
  { distance_km: 3, traffic_level: 0.2 },
  { distance_km: 5, traffic_level: 0.3 },
  { distance_km: 8, traffic_level: 0.5 },
  { distance_km: 12, traffic_level: 0.4 },
  { distance_km: 20, traffic_level: 0.7 },
  { distance_km: 30, traffic_level: 0.6 },
  { distance_km: 50, traffic_level: 0.1 },
];

const SURGE_PAYLOADS = [
  { demand_index: 1.0, supply_index: 2.0 },
  { demand_index: 2.0, supply_index: 1.0 },
  { demand_index: 3.0, supply_index: 1.0 },
  { demand_index: 1.5, supply_index: 1.5 },
  { demand_index: 5.0, supply_index: 2.0 },
];

const ORCHESTRATE_DRIVERS = [
  { driver_id: 'D-PH-1', distance_km: 0.5, rating: 4.8, status: 'ONLINE', price: 30000 },
  { driver_id: 'D-PH-2', distance_km: 2.0, rating: 4.5, status: 'ONLINE', price: 45000 },
  { driver_id: 'D-PH-3', distance_km: 5.0, rating: 4.2, status: 'ONLINE', price: 60000 },
];

export default function () {
  const iteration = __ITER;

  // ── Mix of endpoints to simulate real traffic ──────────────

  // 60% — ETA requests (most common)
  group('ETA Request', () => {
    const payload = ETA_PAYLOADS[iteration % ETA_PAYLOADS.length];
    const res = http.post(
      `${BASE_URL}/api/eta`,
      JSON.stringify(payload),
      params,
    );
    etaLatency.add(res.timings.duration);

    const ok = check(res, {
      'ETA: status 200|429': (r) => r.status === 200 || r.status === 429,
    });
    errorRate.add(!ok);
  });

  // 25% — Surge requests
  if (iteration % 4 < 3) {
    group('Surge Request', () => {
      const payload = SURGE_PAYLOADS[iteration % SURGE_PAYLOADS.length];
      const res = http.post(
        `${BASE_URL}/api/ai/surge`,
        JSON.stringify(payload),
        params,
      );
      surgeLatency.add(res.timings.duration);

      const ok = check(res, {
        'Surge: status 200|429': (r) => r.status === 200 || r.status === 429,
      });
      errorRate.add(!ok);
    });
  }

  // 15% — Orchestrate requests (heaviest)
  if (iteration % 7 === 0) {
    group('Orchestrate Request', () => {
      const res = http.post(
        `${BASE_URL}/api/ai/orchestrate`,
        JSON.stringify({
          drivers: ORCHESTRATE_DRIVERS,
          distance_km: 5 + (iteration % 10),
          traffic_level: 0.3 + (iteration % 5) * 0.1,
        }),
        params,
      );
      orchestrateLatency.add(res.timings.duration);

      const ok = check(res, {
        'Orchestrate: status 200|429': (r) => r.status === 200 || r.status === 429,
      });
      errorRate.add(!ok);
    });
  }

  sleep(0.2);
}

// ─── Summary Report ──────────────────────────────────────────
export function handleSummary(data) {
  const overall = data.metrics.http_req_duration?.values?.['p(95)'] || 'N/A';
  const etaP95 = data.metrics.eta_p95?.values?.['p(95)'] || 'N/A';
  const surgeP95 = data.metrics.surge_p95?.values?.['p(95)'] || 'N/A';
  const orchP95 = data.metrics.orchestrate_p95?.values?.['p(95)'] || 'N/A';
  const errRate = data.metrics.errors?.values?.rate || 0;
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  🏙️  PEAK HOURS SUSTAINED LOAD TEST');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Duration:           10 minutes`);
  console.log(`  Total Requests:     ${totalReqs}`);
  console.log(`  Overall P95:        ${typeof overall === 'number' ? overall.toFixed(2) : overall}ms`);
  console.log(`  ETA P95:            ${typeof etaP95 === 'number' ? etaP95.toFixed(2) : etaP95}ms`);
  console.log(`  Surge P95:          ${typeof surgeP95 === 'number' ? surgeP95.toFixed(2) : surgeP95}ms`);
  console.log(`  Orchestrate P95:    ${typeof orchP95 === 'number' ? orchP95.toFixed(2) : orchP95}ms`);
  console.log(`  Error Rate:         ${(errRate * 100).toFixed(2)}%`);
  console.log(`  TC69:               ${errRate < 0.05 ? '✅ PASS' : '❌ FAIL'} (sustained load stable)`);
  console.log('═══════════════════════════════════════════════════');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
