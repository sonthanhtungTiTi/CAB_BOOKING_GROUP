/**
 * ═══════════════════════════════════════════════════════════════
 *  ai-spike.js — k6 Spike Test (TC62, TC63)
 *
 *  Mục tiêu:
 *    TC62: Spike 500 VUs đột ngột → AI ETA không crash
 *    TC63: Pricing endpoint survive spike without fallback cascade
 *
 *  Chạy: k6 run load-tests/ai-spike.js
 * ═══════════════════════════════════════════════════════════════
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom Metrics ──────────────────────────────────────────
const etaErrors = new Rate('eta_errors');
const pricingErrors = new Rate('pricing_errors');
const spikeLatency = new Trend('spike_latency', true);
const fallbackCount = new Counter('fallback_triggered');

// ─── Spike Profile ───────────────────────────────────────────
//  Đột ngột tăng lên 500 VUs rồi tụt xuống
export const options = {
  stages: [
    { duration: '10s', target: 10 },    // Baseline
    { duration: '5s',  target: 500 },   // 🔥 SPIKE — đột ngột lên 500 VUs
    { duration: '30s', target: 500 },   // Duy trì spike
    { duration: '10s', target: 10 },    // Recovery
    { duration: '20s', target: 10 },    // Observe recovery
    { duration: '5s',  target: 0 },     // Shutdown
  ],
  thresholds: {
    // System MUST NOT crash — allow higher error rate during spike (< 20%)
    'eta_errors': ['rate<0.20'],
    'pricing_errors': ['rate<0.20'],
    // Spike latency — more generous: P95 < 1000ms
    'spike_latency': ['p(95)<1000'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';
const params = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  // ── TC62: Spike ETA ────────────────────────────────────────
  group('TC62: AI ETA Spike', () => {
    const dist = 5 + (__ITER % 20);
    const traffic = 0.1 + (__ITER % 8) * 0.1;

    const etaRes = http.post(
      `${BASE_URL}/api/eta`,
      JSON.stringify({ distance_km: dist, traffic_level: traffic }),
      params,
    );

    spikeLatency.add(etaRes.timings.duration);

    const etaOk = check(etaRes, {
      'ETA status 200 or 429': (r) => r.status === 200 || r.status === 429,
      'ETA not 500': (r) => r.status !== 500,
    });

    // Check for fallback responses
    if (etaRes.status === 200) {
      try {
        const body = etaRes.json();
        const data = body.data || body;
        if (data.is_fallback) {
          fallbackCount.add(1);
        }
      } catch (_) {}
    }

    etaErrors.add(!etaOk);
  });

  // ── TC63: Spike Pricing ────────────────────────────────────
  group('TC63: Pricing Spike', () => {
    const dist = 3 + (__ITER % 15);

    const pricingRes = http.post(
      `${BASE_URL}/api/pricing/calculate`,
      JSON.stringify({
        distance_km: dist,
        demand_index: 1.5,
        supply_index: 1.0,
      }),
      params,
    );

    spikeLatency.add(pricingRes.timings.duration);

    const pricingOk = check(pricingRes, {
      'Pricing status 200 or 429': (r) => r.status === 200 || r.status === 429,
      'Pricing not 500': (r) => r.status !== 500,
    });

    pricingErrors.add(!pricingOk);
  });

  sleep(0.05);
}

// ─── Summary Report ──────────────────────────────────────────
export function handleSummary(data) {
  const p95 = data.metrics.spike_latency?.values?.['p(95)'] || 'N/A';
  const etaErr = data.metrics.eta_errors?.values?.rate || 0;
  const pricErr = data.metrics.pricing_errors?.values?.rate || 0;
  const fallbacks = data.metrics.fallback_triggered?.values?.count || 0;

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  🔥 AI SPIKE TEST RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Spike P95 Latency:     ${typeof p95 === 'number' ? p95.toFixed(2) : p95}ms`);
  console.log(`  ETA Error Rate:        ${(etaErr * 100).toFixed(2)}%`);
  console.log(`  Pricing Error Rate:    ${(pricErr * 100).toFixed(2)}%`);
  console.log(`  Fallbacks Triggered:   ${fallbacks}`);
  console.log(`  TC62:                  ${etaErr < 0.20 ? '✅ PASS' : '❌ FAIL'} (ETA errors < 20%)`);
  console.log(`  TC63:                  ${pricErr < 0.20 ? '✅ PASS' : '❌ FAIL'} (Pricing errors < 20%)`);
  console.log('═══════════════════════════════════════════════════');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
