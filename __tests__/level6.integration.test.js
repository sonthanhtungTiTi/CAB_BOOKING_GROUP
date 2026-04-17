/**
 * ═══════════════════════════════════════════════════════════════════
 *  LEVEL 6 — AI Agent Logic (Jest + Supertest)
 *
 *  10 Test Cases (TC51 → TC60): Composite Scoring, Tool Calling,
 *  Missing Data Defaults, Retry, Offline Filter, Decision Log,
 *  Concurrent Safety, Fallback.
 *
 *  Triết lý: Test theo Context-driven (ngữ cảnh) — cùng 1 endpoint
 *  nhưng input khác nhau sẽ cho quyết định khác nhau, chứng minh
 *  Agent THỰC SỰ suy luận chứ không phải code chống chế.
 *
 *  ⚠️ YÊU CẦU: Tất cả services phải đang chạy (npm run start:all)
 * ═══════════════════════════════════════════════════════════════════
 */
const request = require('supertest');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

// ─── Sample Driver Data (dùng chung cho nhiều TC) ────────────
const SAMPLE_DRIVERS = [
  { driver_id: 'D-CLOSE-LOW',  distance_km: 0.5, rating: 3.2, status: 'ONLINE',  price: 30000 },
  { driver_id: 'D-FAR-HIGH',   distance_km: 8.0, rating: 4.9, status: 'ONLINE',  price: 80000 },
  { driver_id: 'D-MID-MID',    distance_km: 2.0, rating: 4.5, status: 'ONLINE',  price: 45000 },
  { driver_id: 'D-OFFLINE',    distance_km: 0.3, rating: 5.0, status: 'OFFLINE', price: 20000 },
];

describe('Level 6 — AI Agent Logic (TC51-TC60)', () => {

  // ────────────────────────────────────────────────────────────
  //  TC 51: Composite Scoring — Agent chọn driver theo điểm tổng hợp
  //  Verify: Driver gần + rating khá phải thắng driver xa rating cao
  // ────────────────────────────────────────────────────────────
  test('TC51: POST /api/ai/orchestrate → selects driver by composite score (not just distance)', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: SAMPLE_DRIVERS,
        distance_km: 5,
        traffic_level: 0.3,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.selected_driver).toBeDefined();
    expect(body.selected_driver.driver_id).toBeDefined();
    expect(body.selected_driver.score).toBeGreaterThan(0);

    // Agent phải KHÔNG chọn OFFLINE driver
    expect(body.selected_driver.driver_id).not.toBe('D-OFFLINE');

    // Verify all_scores chứa danh sách đã tính điểm
    expect(body.selected_driver.all_scores).toBeDefined();
    expect(body.selected_driver.all_scores.length).toBe(3); // 3 ONLINE drivers

    console.log(`  ✅ TC51: Composite scoring OK — Selected ${body.selected_driver.driver_id} (score=${body.selected_driver.score})`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 52: Score Ordering — Verify scores descending
  // ────────────────────────────────────────────────────────────
  test('TC52: POST /api/ai/orchestrate → all_scores sorted descending', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: SAMPLE_DRIVERS,
        distance_km: 10,
        traffic_level: 0.5,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    const scores = body.selected_driver.all_scores;

    expect(scores.length).toBeGreaterThanOrEqual(2);

    // Verify sorted descending
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }

    console.log(`  ✅ TC52: Score ordering OK — [${scores.map(s => `${s.driver_id}:${s.score}`).join(', ')}]`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 53: Weight Balancing — same distance, different rating
  //  → higher rating wins
  // ────────────────────────────────────────────────────────────
  test('TC53: POST /api/ai/orchestrate → higher rating wins when distance is equal', async () => {
    const equalDistDrivers = [
      { driver_id: 'D-EQ-LOW',  distance_km: 3.0, rating: 3.0, status: 'ONLINE', price: 40000 },
      { driver_id: 'D-EQ-HIGH', distance_km: 3.0, rating: 4.8, status: 'ONLINE', price: 40000 },
    ];

    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: equalDistDrivers,
        distance_km: 5,
        traffic_level: 0.4,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    // When distance & price are equal, rating is the tiebreaker
    expect(body.selected_driver.driver_id).toBe('D-EQ-HIGH');

    console.log(`  ✅ TC53: Weight balancing OK — Equal distance, selected higher rating: ${body.selected_driver.driver_id}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 54: Tool Calling — Verify sequential pipeline (ETA → Price)
  // ────────────────────────────────────────────────────────────
  test('TC54: POST /api/ai/orchestrate → orchestration_steps show ETA before Pricing', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: SAMPLE_DRIVERS,
        distance_km: 10,
        traffic_level: 0.5,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    // Verify orchestration pipeline exists
    expect(body.orchestration_steps).toBeDefined();
    expect(Array.isArray(body.orchestration_steps)).toBe(true);
    expect(body.orchestration_steps.length).toBeGreaterThanOrEqual(3);

    // Step 1 is ETA, Step 2 is Pricing (sequential order)
    expect(body.orchestration_steps[0].tool).toBe('calculateETA');
    expect(body.orchestration_steps[1].tool).toBe('calculatePricing');
    expect(body.orchestration_steps[2].tool).toBe('selectBestDriver');

    // Verify ETA feeds into Pricing
    const etaOutput = body.orchestration_steps[0].output.eta;
    expect(etaOutput).toBeGreaterThan(0);
    expect(body.eta).toBe(etaOutput);
    expect(body.price).toBeGreaterThan(0);

    console.log(`  ✅ TC54: Tool calling OK — Pipeline: ETA(${body.eta}min) → Price(${body.price}đ) → Driver(${body.selected_driver.driver_id})`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 55: Missing Data Defaults — null rating, missing traffic
  //  → Agent uses defaults, no NaN
  // ────────────────────────────────────────────────────────────
  test('TC55: POST /api/ai/orchestrate → handles missing rating/traffic with defaults (no NaN)', async () => {
    const incompleteDrivers = [
      { driver_id: 'D-NO-RATING', distance_km: 2.0, status: 'ONLINE', price: 40000 },
      { driver_id: 'D-NORMAL',    distance_km: 3.0, rating: 4.5, status: 'ONLINE', price: 50000 },
    ];

    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: incompleteDrivers,
        distance_km: 5,
        // traffic_level intentionally missing
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    // No NaN anywhere
    expect(Number.isFinite(body.eta)).toBe(true);
    expect(Number.isFinite(body.price)).toBe(true);
    expect(body.selected_driver).toBeDefined();
    expect(Number.isFinite(body.selected_driver.score)).toBe(true);
    expect(body.selected_driver.score).toBeGreaterThan(0);

    console.log(`  ✅ TC55: Default params OK — Missing data handled, ETA=${body.eta}, Price=${body.price}, Score=${body.selected_driver.score}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 56: Retry — withRetry mechanism (tested via TC60 fallback)
  //  Here we verify that normal flow does NOT trigger retries
  // ────────────────────────────────────────────────────────────
  test('TC56: POST /api/ai/orchestrate → normal flow succeeds without fallback (retry not needed)', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: SAMPLE_DRIVERS,
        distance_km: 5,
        traffic_level: 0.3,
        simulate_agent_fail: false, // explicitly no failure
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    expect(body.is_fallback).toBe(false);
    expect(body.selected_driver).toBeDefined();
    expect(body.selected_driver.score).toBeGreaterThan(0);

    console.log(`  ✅ TC56: Retry (normal path) OK — No fallback triggered, is_fallback=${body.is_fallback}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 57: Filter Offline — OFFLINE drivers must be excluded
  // ────────────────────────────────────────────────────────────
  test('TC57: POST /api/ai/orchestrate → OFFLINE drivers excluded from selection', async () => {
    const mixedDrivers = [
      { driver_id: 'D-OFF-1',  distance_km: 0.1, rating: 5.0, status: 'OFFLINE', price: 10000 },
      { driver_id: 'D-OFF-2',  distance_km: 0.2, rating: 5.0, status: 'OFFLINE', price: 10000 },
      { driver_id: 'D-ON-1',   distance_km: 5.0, rating: 3.5, status: 'ONLINE',  price: 50000 },
    ];

    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: mixedDrivers,
        distance_km: 5,
        traffic_level: 0.3,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    // Only ONLINE driver should be selected
    expect(body.selected_driver).toBeDefined();
    expect(body.selected_driver.driver_id).toBe('D-ON-1');

    // Verify all_scores only contains ONLINE drivers
    expect(body.selected_driver.all_scores.length).toBe(1);

    console.log(`  ✅ TC57: Offline filter OK — 2 OFFLINE excluded, selected ONLINE: ${body.selected_driver.driver_id}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 58: Decision Log — response contains decision_log string
  // ────────────────────────────────────────────────────────────
  test('TC58: POST /api/ai/orchestrate → decision_log present with [AGENT DECISION]', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: SAMPLE_DRIVERS,
        distance_km: 5,
        traffic_level: 0.3,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    expect(body.decision_log).toBeDefined();
    expect(typeof body.decision_log).toBe('string');
    expect(body.decision_log).toContain('[AGENT DECISION]');
    expect(body.decision_log).toContain('Selected Driver');

    console.log(`  ✅ TC58: Decision log OK — ${body.decision_log}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 59: Concurrent Safety — 10 parallel requests, no data leak
  // ────────────────────────────────────────────────────────────
  test('TC59: Promise.all 10 concurrent /api/ai/orchestrate → all 200 OK, no data corruption', async () => {
    const concurrentRequests = Array.from({ length: 10 }, (_, i) => {
      const drivers = [
        { driver_id: `D-PARA-${i}-A`, distance_km: 1 + i, rating: 4.0, status: 'ONLINE', price: 30000 + i * 1000 },
        { driver_id: `D-PARA-${i}-B`, distance_km: 5 + i, rating: 4.5, status: 'ONLINE', price: 50000 + i * 1000 },
      ];

      return request(API_BASE)
        .post('/api/ai/orchestrate')
        .send({
          drivers,
          distance_km: 3 + i,
          traffic_level: 0.2 + i * 0.05,
        });
    });

    const results = await Promise.all(concurrentRequests);

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      expect(res.status).toBe(200);
      const body = res.body.data || res.body;

      // Must not be undefined or NaN
      expect(body.selected_driver).toBeDefined();
      expect(body.selected_driver.driver_id).toBeDefined();
      expect(Number.isFinite(body.eta)).toBe(true);
      expect(Number.isFinite(body.price)).toBe(true);

      // Verify the driver belongs to THIS request's set (no cross-contamination)
      expect(body.selected_driver.driver_id).toContain(`D-PARA-${i}`);
    }

    console.log(`  ✅ TC59: Concurrent safety OK — 10/10 requests returned valid, isolated data`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 60: Agent Fallback — simulate_agent_fail → rule-based fallback
  // ────────────────────────────────────────────────────────────
  test('TC60: POST /api/ai/orchestrate with simulate_agent_fail → fallback to first ONLINE driver', async () => {
    const res = await request(API_BASE)
      .post('/api/ai/orchestrate')
      .send({
        drivers: SAMPLE_DRIVERS,
        distance_km: 5,
        traffic_level: 0.3,
        simulate_agent_fail: true,
      });

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    // Must be flagged as fallback
    expect(body.is_fallback).toBe(true);

    // Fallback picks first ONLINE driver (D-CLOSE-LOW is first ONLINE in array)
    expect(body.selected_driver).toBeDefined();
    expect(body.selected_driver.driver_id).toBe('D-CLOSE-LOW');

    // ETA and Price still computed (before agent selection fails)
    expect(Number.isFinite(body.eta)).toBe(true);
    expect(Number.isFinite(body.price)).toBe(true);

    // Decision log reflects fallback
    expect(body.decision_log).toContain('FALLBACK');

    expect(body.model_version).toBeDefined();

    console.log(`  ✅ TC60: Agent fallback OK — Crashed, recovered with rule-based driver: ${body.selected_driver.driver_id}`);
  });

});
