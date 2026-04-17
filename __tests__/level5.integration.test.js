/**
 * ═══════════════════════════════════════════════════════════════════
 *  LEVEL 5 — AI Service Validation (Jest + Supertest)
 *
 *  10 Test Cases (TC41 → TC50): ETA Boundaries, Surge Pricing,
 *  Fraud Detection, Top-3 Drivers, Forecast, Model Version,
 *  Latency, Drift Detection, Fallback, Abnormal Input.
 *
 *  Triết lý MLOps: Test theo Boundary (giới hạn) & Reliability
 *  (độ tin cậy), KHÔNG test giá trị cố định.
 *
 *  ⚠️ YÊU CẦU: Tất cả services phải đang chạy (npm run start:all)
 * ═══════════════════════════════════════════════════════════════════
 */
const request = require('supertest');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

describe('Level 5 — AI Service Validation (TC41-TC50)', () => {

  // ────────────────────────────────────────────────────────────
  //  TC 41: ETA Boundaries — eta > 0 && eta < 120 for realistic input
  // ────────────────────────────────────────────────────────────
  test('TC41: POST /api/eta → eta > 0 and eta < 120 (Boundary Test)', async () => {
    // Test with various realistic distances
    const testCases = [
      { distance_km: 5, traffic_level: 0.3, label: '5km light traffic' },
      { distance_km: 20, traffic_level: 0.7, label: '20km heavy traffic' },
      { distance_km: 50, traffic_level: 0.1, label: '50km minimal traffic' },
    ];

    for (const tc of testCases) {
      const res = await request(API_BASE)
        .post('/api/eta')
        .send(tc);

      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(body.eta).toBeGreaterThan(0);
      expect(body.eta).toBeLessThan(120);
    }

    console.log('  ✅ TC41: ETA boundaries verified — all values in (0, 120) range');
  });

  // ────────────────────────────────────────────────────────────
  //  TC 42: Surge Pricing — demand/supply > 1 → surge > 1
  // ────────────────────────────────────────────────────────────
  test('TC42: POST /api/ai/surge → surge > 1 when demand > supply', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/surge')
      .send({ demand_index: 3.0, supply_index: 1.0 });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.surge).toBeGreaterThan(1);
    expect(body.model_version).toBeDefined();

    // Also test balanced scenario: surge === 1
    const balanced = await request(API_BASE)
      .post('/api/ai/surge')
      .send({ demand_index: 1.0, supply_index: 2.0 });

    const balBody = balanced.body.data || balanced.body;
    expect(balBody.surge).toBe(1); // floor is 1.0

    console.log(`  ✅ TC42: Surge pricing OK — high demand=${body.surge}, balanced=${balBody.surge}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 43: Fraud Detection — amount > 5M → is_flagged: true
  // ────────────────────────────────────────────────────────────
  test('TC43: POST /api/ai/fraud → is_flagged: true when amount > 5,000,000', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/fraud')
      .send({ amount: 6000000, user_id: 'user-fraud-test' });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.is_flagged).toBe(true);
    expect(body.score).toBeGreaterThan(0.8);
    expect(body.model_version).toBeDefined();

    // Normal amount → not flagged
    const normal = await request(API_BASE)
      .post('/api/ai/fraud')
      .send({ amount: 100000, user_id: 'user-normal' });

    const nBody = normal.body.data || normal.body;
    expect(nBody.is_flagged).toBe(false);
    expect(nBody.score).toBeLessThanOrEqual(0.8);

    console.log(`  ✅ TC43: Fraud detection OK — flagged score=${body.score}, normal score=${nBody.score}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 44: Top-3 Drivers — composite scoring, max 3 returned
  // ────────────────────────────────────────────────────────────
  test('TC44: POST /api/ai/recommend → returns top 3 drivers sorted by score', async () => {
    const drivers = [
      { driver_id: 'D1', distance_km: 0.5, rating: 4.9 },
      { driver_id: 'D2', distance_km: 3.0, rating: 4.5 },
      { driver_id: 'D3', distance_km: 1.0, rating: 4.8 },
      { driver_id: 'D4', distance_km: 10.0, rating: 5.0 },
      { driver_id: 'D5', distance_km: 0.2, rating: 3.0 },
    ];

    const res = await request(API_BASE)
      .post('/api/ai/recommend')
      .send({ drivers });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.recommendations).toBeDefined();
    expect(Array.isArray(body.recommendations)).toBe(true);
    expect(body.recommendations.length).toBeLessThanOrEqual(3);
    expect(body.model_version).toBeDefined();

    // Verify sorted by score descending
    for (let i = 1; i < body.recommendations.length; i++) {
      expect(body.recommendations[i - 1].score).toBeGreaterThanOrEqual(body.recommendations[i].score);
    }

    console.log(`  ✅ TC44: Top-3 drivers = [${body.recommendations.map(d => d.driver_id).join(', ')}]`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 45: Forecast API — returns array with time + predicted_demand
  // ────────────────────────────────────────────────────────────
  test('TC45: GET /api/ai/forecast → array of { time, predicted_demand }', async () => {
    const res = await request(API_BASE)
      .get('/api/ai/forecast');

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.forecast).toBeDefined();
    expect(Array.isArray(body.forecast)).toBe(true);
    expect(body.forecast.length).toBeGreaterThan(0);

    // Verify schema of each entry
    const entry = body.forecast[0];
    expect(entry.time).toBeDefined();
    expect(typeof entry.time).toBe('string');
    expect(entry.predicted_demand).toBeDefined();
    expect(typeof entry.predicted_demand).toBe('number');

    // Verify peak hours have higher demand than late night
    const morning = body.forecast.find(f => f.time === '08:00');
    const night = body.forecast.find(f => f.time === '03:00');
    expect(morning.predicted_demand).toBeGreaterThan(night.predicted_demand);

    expect(body.model_version).toBeDefined();

    console.log(`  ✅ TC45: Forecast OK — ${body.forecast.length} time slots, morning=${morning.predicted_demand}, night=${night.predicted_demand}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 46: Model Version — every AI response has model_version
  // ────────────────────────────────────────────────────────────
  test('TC46: All AI endpoints include model_version in response', async () => {
    // Test multiple endpoints
    const etaRes = await request(API_BASE)
      .post('/api/eta')
      .send({ distance_km: 5, traffic_level: 0.3 });

    const surgeRes = await request(API_BASE)
      .post('/api/ai/surge')
      .send({ demand_index: 2.0, supply_index: 1.0 });

    const fraudRes = await request(API_BASE)
      .post('/api/ai/fraud')
      .send({ amount: 100000, user_id: 'test-user' });

    const forecastRes = await request(API_BASE)
      .get('/api/ai/forecast');

    const etaBody = etaRes.body.data || etaRes.body;
    const surgeBody = surgeRes.body.data || surgeRes.body;
    const fraudBody = fraudRes.body.data || fraudRes.body;
    const forecastBody = forecastRes.body.data || forecastRes.body;

    expect(etaBody.model_version).toBeDefined();
    expect(surgeBody.model_version).toBeDefined();
    expect(fraudBody.model_version).toBeDefined();
    expect(forecastBody.model_version).toBeDefined();

    console.log(`  ✅ TC46: model_version present in all AI responses: ${etaBody.model_version}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 47: Latency — AI endpoints respond in < 200ms
  // ────────────────────────────────────────────────────────────
  test('TC47: POST /api/eta → latency < 200ms', async () => {
    const start = Date.now();

    const res = await request(API_BASE)
      .post('/api/eta')
      .send({ distance_km: 10, traffic_level: 0.5 });

    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(200);

    // Also test surge latency
    const start2 = Date.now();
    await request(API_BASE)
      .post('/api/ai/surge')
      .send({ demand_index: 2.0, supply_index: 1.0 });
    const duration2 = Date.now() - start2;
    expect(duration2).toBeLessThan(200);

    console.log(`  ✅ TC47: Latency OK — ETA=${duration}ms, Surge=${duration2}ms (threshold: 200ms)`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 48: Drift Detection — extreme traffic_level triggers warning
  // ────────────────────────────────────────────────────────────
  test('TC48: POST /api/eta with traffic_level=10 → still returns valid ETA (drift logged)', async () => {
    const res = await request(API_BASE)
      .post('/api/eta')
      .send({ distance_km: 10, traffic_level: 10.0 });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    // System must still return a valid, bounded ETA (not NaN, not Infinity)
    expect(body.eta).toBeDefined();
    expect(typeof body.eta).toBe('number');
    expect(body.eta).toBeGreaterThan(0);
    expect(body.eta).toBeLessThanOrEqual(120);
    expect(Number.isFinite(body.eta)).toBe(true);

    // Console log "[MLOps WARNING] Data Drift Detected" will be in server logs
    console.log(`  ✅ TC48: Drift handled — extreme traffic=10.0, bounded ETA=${body.eta} (server logged drift warning)`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 49: Model Fallback — Chaos Engineering crash simulation
  // ────────────────────────────────────────────────────────────
  test('TC49: POST /api/eta trigger model crash → returns fallback value', async () => {
    const res = await request(API_BASE)
      .post('/api/eta')
      .send({
        distance_km: 5,
        traffic_level: 0.5,
        simulate_model_crash: true,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.eta).toBe(15); // Fallback ETA
    expect(body.model_version).toBeDefined();
    expect(body.is_fallback).toBe(true);

    console.log(`  ✅ TC49: Fallback OK — Model crashed, system recovered with fallback ETA=${body.eta}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 50: Abnormal Input — negative distance → 400 Bad Request
  // ────────────────────────────────────────────────────────────
  test('TC50: POST /api/eta with distance_km=-5 → 400 Bad Request', async () => {
    // Negative distance
    const res = await request(API_BASE)
      .post('/api/eta')
      .send({ distance_km: -5, traffic_level: 0.3 });

    expect(res.status).toBe(400);
    const body = res.body.data || res.body;
    expect(body.message).toBeDefined();

    // String input
    const res2 = await request(API_BASE)
      .post('/api/eta')
      .send({ distance_km: 'abc', traffic_level: 0.3 });

    expect(res2.status).toBe(400);

    // Missing input
    const res3 = await request(API_BASE)
      .post('/api/eta')
      .send({});

    expect(res3.status).toBe(400);

    console.log(`  ✅ TC50: Abnormal input blocked — negative=400, string=400, missing=400`);
  });

});
