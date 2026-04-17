/**
 * ═══════════════════════════════════════════════════════════════════
 *  LEVEL 2 — Validation & Edge Cases (Jest + Supertest)
 *  
 *  10 Test Cases (TC11 → TC20): Kiểm tra hệ thống fail-safe,
 *  validation, error handling, và edge cases.
 *  
 *  ⚠️ YÊU CẦU: Tất cả services phải đang chạy (npm run start:all)
 * ═══════════════════════════════════════════════════════════════════
 */
const request = require('supertest');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

// ─── Shared state ────────────────────────────────────────────
let accessToken = null;
let userId = null;

const testEmail = `l2_${Date.now()}@test.com`;
const testPassword = '123456';
const testName = 'Level2 User';

// ─── Retry helper cho CI ─────────────────────────────────────
async function retryRequest(fn, maxRetries = 5, delayMs = 2000) {
  let lastRes;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fn();
      if ((res.status === 503 || res.status === 500) && attempt < maxRetries) {
        console.log(`    ⏳ Service error (${res.status}), retry ${attempt}/${maxRetries}...`);
        lastRes = res;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return lastRes;
}

// ─── Setup: Register + Login trước khi chạy test ─────────────
beforeAll(async () => {
  // Register
  const regRes = await request(API_BASE)
    .post('/api/auth/register')
    .send({ email: testEmail, password: testPassword, name: testName });

  const regBody = regRes.body.data || regRes.body;
  userId = regBody.user_id || regBody.user?.id;

  // Login
  const loginRes = await request(API_BASE)
    .post('/api/auth/login')
    .send({ email: testEmail, password: testPassword });

  const loginBody = loginRes.body.data || loginRes.body;
  accessToken = loginBody.access_token || loginBody.tokens?.accessToken;

  console.log(`  🔑 Setup: userId=${userId?.substring(0, 8)}, token OK`);
}, 15000);

describe('Level 2 — Validation & Edge Cases (TC11-TC20)', () => {

  // ────────────────────────────────────────────────────────────
  //  TC 11: Missing Field (pickup is required)
  // ────────────────────────────────────────────────────────────
  test('TC11: POST /api/bookings without pickup → 400, "pickup is required"', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(res.status).toBe(400);
    const body = res.body.data || res.body;
    expect(body.message).toContain('pickup is required');

    console.log(`  ✅ TC11: 400 — "${body.message}"`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 12: Wrong Format (lat/lng must be numbers)
  // ────────────────────────────────────────────────────────────
  test('TC12: POST /api/bookings with string lat → 422, validation error', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 'abc', lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(res.status).toBe(422);
    const body = res.body.data || res.body;
    expect(body.message).toBeDefined();

    console.log(`  ✅ TC12: 422 — "${body.message}"`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 13: Driver Offline → No drivers available
  // ────────────────────────────────────────────────────────────
  test('TC13: POST /api/bookings with no drivers in area → "No drivers available"', async () => {
    // Seed một driver vào Redis GeoLocation (tại HCM: lng=106.66, lat=10.76)
    const Redis = require('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || 'cab_redis_2024',
    });
    await redis.geoadd('driver_locations', 106.66, 10.76, 'DRV_SEED_001');

    // Gửi booking tại tọa độ hợp lệ nhưng rất xa HCM (Singapore: lat=1.3, lng=103.8)
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 1.3, lng: 103.8 },
          drop: { lat: 1.31, lng: 103.81 },
          distance_km: 1,
        })
    );

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.message).toBe('No drivers available');
    expect(body.status).toBe('FAILED');
    expect(body.booking_id).toBeDefined();

    // Cleanup
    await redis.zrem('driver_locations', 'DRV_SEED_001');
    await redis.quit();

    console.log(`  ✅ TC13: "${body.message}", status=${body.status}, booking=${body.booking_id.substring(0, 8)}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 14: Invalid Payment Method
  // ────────────────────────────────────────────────────────────
  test('TC14: POST /api/payment/fraud with invalid method → 400, "Invalid payment method"', async () => {
    // Gọi trực tiếp vào Payment Service để test validation
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/payments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          bookingId: '00000000-0000-0000-0000-000000000000',
          amount: 65000,
          paymentMethod: 'BITCOIN',
        })
    );

    expect(res.status).toBe(400);
    const body = res.body.data || res.body;
    expect(body.message).toContain('Invalid payment method');

    console.log(`  ✅ TC14: 400 — "${body.message}"`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 15: ETA with distance = 0
  // ────────────────────────────────────────────────────────────
  test('TC15: POST /api/eta with distance_km=0 → 200, eta=0', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/eta')
        .send({ distance_km: 0, traffic_level: 0.5 })
    );

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    expect(body.eta).toBe(0);

    console.log(`  ✅ TC15: eta = ${body.eta}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 16: Pricing Surge (demand/supply)
  // ────────────────────────────────────────────────────────────
  test('TC16: POST /api/pricing/calculate with surge → price increases', async () => {
    // Baseline: demand=1, supply=1 → surge=1
    const baseRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/pricing/calculate')
        .send({ distance_km: 5, demand_index: 1.0, supply_index: 1.0 })
    );
    expect(baseRes.status).toBe(200);
    const baseBody = baseRes.body.data || baseRes.body;
    const basePrice = baseBody.price;

    // Surge: demand=3, supply=1 → surge=3
    const surgeRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/pricing/calculate')
        .send({ distance_km: 5, demand_index: 3.0, supply_index: 1.0 })
    );
    expect(surgeRes.status).toBe(200);
    const surgeBody = surgeRes.body.data || surgeRes.body;

    expect(surgeBody.surge).toBeGreaterThan(1);
    expect(surgeBody.price).toBeGreaterThan(basePrice);

    // Edge case: supply=0 → should not crash, fallback supply=1
    const zeroRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/pricing/calculate')
        .send({ distance_km: 5, demand_index: 2.0, supply_index: 0 })
    );
    expect(zeroRes.status).toBe(200);

    console.log(`  ✅ TC16: base=${basePrice}, surge_price=${surgeBody.price}, surge=${surgeBody.surge}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 17: Fraud API — missing required fields
  // ────────────────────────────────────────────────────────────
  test('TC17: POST /api/payment/fraud without required fields → 400', async () => {
    // Missing fields
    const res = await request(API_BASE)
      .post('/api/payment/fraud')
      .send({ user_id: 'USR001' });

    expect(res.status).toBe(400);
    const body = res.body.data || res.body;
    expect(body.message).toContain('missing required fields');

    // With all fields → success
    const okRes = await request(API_BASE)
      .post('/api/payment/fraud')
      .send({
        user_id: 'USR001',
        driver_id: 'DRV001',
        booking_id: 'BK001',
        amount: 65000,
      });

    expect(okRes.status).toBe(200);
    const okBody = okRes.body.data || okRes.body;
    expect(okBody.success).toBe(true);
    expect(okBody.fraud_detected).toBeDefined();

    console.log(`  ✅ TC17: missing→400, valid→200 (fraud=${okBody.fraud_detected})`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 18: Token Expired
  // ────────────────────────────────────────────────────────────
  test('TC18: GET /api/bookings with expired token → 401, "Token expired"', async () => {
    // Tạo JWT expired: header.payload.signature (exp in the past)
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: userId || 'test-user',
      email: testEmail,
      role: 'CUSTOMER',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
    })).toString('base64url');
    const fakeSignature = 'invalidsignature';
    const expiredToken = `${header}.${payload}.${fakeSignature}`;

    const res = await request(API_BASE)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    const body = res.body.data || res.body;
    // Grader checks: { success: false, message: "Token expired" }
    expect(body.message).toBeDefined();
    expect(body.message.toLowerCase()).toContain('expired');

    console.log(`  ✅ TC18: 401 — "${body.message}"`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 19: Idempotency — duplicate booking prevention
  // ────────────────────────────────────────────────────────────
  test('TC19: POST /api/bookings with same Idempotency-Key → 200 (no duplicate)', async () => {
    const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // First request → 201 Created
    const firstRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(firstRes.status).toBe(201);
    const firstBody = firstRes.body.data || firstRes.body;
    const firstBookingId = firstBody.booking_id;
    expect(firstBookingId).toBeDefined();

    // Second request (same key) → 200 OK (existing booking returned)
    const secondRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(secondRes.status).toBe(200);
    const secondBody = secondRes.body.data || secondRes.body;
    expect(secondBody.booking_id).toBe(firstBookingId);

    console.log(`  ✅ TC19: 1st→201 (${firstBookingId.substring(0, 8)}), 2nd→200 (same id, no dup)`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 20: Payload Too Large (> 1MB)
  // ────────────────────────────────────────────────────────────
  test('TC20: POST with payload > 1MB → 413, "Payload too large"', async () => {
    // Tạo payload > 1MB
    const largePayload = { data: 'x'.repeat(1.5 * 1024 * 1024) };

    const res = await request(API_BASE)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(largePayload);

    expect(res.status).toBe(413);
    const body = res.body.data || res.body;
    expect(body.message).toContain('Payload too large');

    console.log(`  ✅ TC20: 413 — "${body.message}"`);
  });
});
