/**
 * ═══════════════════════════════════════════════════════════════════
 *  LEVEL 1 — Integration Test Suite (Jest + Supertest)
 *  
 *  Bao phủ 10 Test Cases theo đúng kịch bản Auto-grader.
 *  Chạy tuần tự, truyền dữ liệu giữa các TC thông qua biến closure.
 *  
 *  ⚠️ YÊU CẦU: Tất cả services phải đang chạy (npm run start:all)
 *     hoặc được CI Pipeline khởi động trước khi chạy test.
 * ═══════════════════════════════════════════════════════════════════
 */
const request = require('supertest');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

// ─── Shared state giữa các Test Cases ────────────────────────
let accessToken = null;
let userId = null;
let bookingId = null;

// Email unique mỗi lần chạy test (tránh conflict khi chạy nhiều lần)
const testEmail = `jest_${Date.now()}@test.com`;
const testPassword = '123456';
const testName = 'Test User';

// ─── Retry helper cho CI (xử lý 503 khi service chưa sẵn sàng) ──
async function retryRequest(fn, maxRetries = 8, delayMs = 3000) {
  let lastRes;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fn();
      // Retry trên 503 (service chưa sẵn sàng) hoặc 500 (table chưa tạo xong)
      if ((res.status === 503 || res.status === 500) && attempt < maxRetries) {
        console.log(`    ⏳ Service error (${res.status}), retry ${attempt}/${maxRetries} in ${delayMs}ms...`);
        if (res.body) console.log(`    📋 Error detail:`, JSON.stringify(res.body).substring(0, 200));
        lastRes = res;
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`    ⏳ Request error, retry ${attempt}/${maxRetries} in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return lastRes;
}

describe('Level 1 — Basic API & Flow (10 Test Cases)', () => {

  // ────────────────────────────────────────────────────────────
  //  TC 1: Đăng ký user thành công
  // ────────────────────────────────────────────────────────────
  test('TC1: POST /api/auth/register → 201, trả về user_id', async () => {
    const res = await request(API_BASE)
      .post('/api/auth/register')
      .send({ email: testEmail, password: testPassword, name: testName })
      .expect('Content-Type', /json/)
      .expect(201);

    const body = res.body.data || res.body;

    userId = body.user_id || body.user?.id;
    expect(userId).toBeDefined();
    expect(typeof userId).toBe('string');
    expect(userId.length).toBeGreaterThan(0);

    const userName = body.user?.name || body.name;
    expect(userName).toBe(testName);

    console.log(`  ✅ TC1: user_id = ${userId.substring(0, 8)}...`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 2: Đăng nhập trả JWT hợp lệ
  // ────────────────────────────────────────────────────────────
  test('TC2: POST /api/auth/login → 200, trả về access_token hợp lệ', async () => {
    const res = await request(API_BASE)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect('Content-Type', /json/)
      .expect(200);

    const body = res.body.data || res.body;

    accessToken = body.access_token || body.tokens?.accessToken;
    expect(accessToken).toBeDefined();
    expect(typeof accessToken).toBe('string');
    expect(accessToken.split('.')).toHaveLength(3);
    
    if (!userId) {
      userId = body.user_id || body.user?.id;
    }

    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    );
    expect(payload.sub).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    console.log(`  ✅ TC2: token OK (sub=${payload.sub.substring(0, 8)}, exp=${payload.exp})`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 5: Driver chuyển trạng thái ONLINE
  //  ⚠️ PHẢI CHẠY TRƯỚC TC3 để tránh NO_DRIVER
  // ────────────────────────────────────────────────────────────
  test('TC5: PUT /api/driver/status → 200, driver = ONLINE', async () => {
    const res = await request(API_BASE)
      .put('/api/driver/status')
      .send({ driver_id: 'DRV001', status: 'ONLINE' })
      .expect('Content-Type', /json/)
      .expect(200);

    const body = res.body.data || res.body;

    expect(body.driver_id).toBe('DRV001');
    expect(body.status).toBe('ONLINE');

    console.log(`  ✅ TC5: Driver ${body.driver_id} = ${body.status}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 3: Tạo booking (Status = REQUESTED)
  //  Có retry logic để xử lý 503 trên CI
  // ────────────────────────────────────────────────────────────
  test('TC3: POST /api/bookings → 201, status = REQUESTED', async () => {
    expect(accessToken).toBeDefined();

    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(res.status).toBe(201);
    const body = res.body.data || res.body;

    bookingId = body.booking_id;
    expect(bookingId).toBeDefined();
    expect(body.status).toBe('REQUESTED');
    expect(body.created_at).toBeDefined();

    console.log(`  ✅ TC3: booking_id = ${bookingId.substring(0, 8)}, status = ${body.status}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 6: Tạo booking — Kiểm tra schema đầy đủ
  // ────────────────────────────────────────────────────────────
  test('TC6: POST /api/bookings → schema đầy đủ (pickup, drop, distance_km)', async () => {
    expect(accessToken).toBeDefined();

    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(res.status).toBe(201);
    const body = res.body.data || res.body;

    expect(body.booking_id).toBeDefined();
    expect(body.status).toBe('REQUESTED');
    expect(body.created_at).toBeDefined();
    expect(body.pickup).toEqual({ lat: 10.76, lng: 106.66 });
    expect(body.drop).toEqual({ lat: 10.77, lng: 106.70 });
    expect(body.distance_km).toBe(5);

    console.log(`  ✅ TC6: schema verified — booking_id=${body.booking_id.substring(0, 8)}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 4: Lấy danh sách booking
  // ────────────────────────────────────────────────────────────
  test('TC4: GET /api/bookings → 200, mảng chứa booking(s)', async () => {
    expect(userId).toBeDefined();

    const res = await retryRequest(() =>
      request(API_BASE)
        .get(`/api/bookings?user_id=${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
    );

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    const list = Array.isArray(body) ? body : [];

    expect(list.length).toBeGreaterThan(0);
    expect(list[0].booking_id).toBeDefined();
    expect(list[0].status).toBeDefined();

    const found = list.find((b) => b.booking_id === bookingId);
    expect(found).toBeDefined();

    console.log(`  ✅ TC4: ${list.length} booking(s) found, first status = ${list[0].status}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 7: API ETA
  // ────────────────────────────────────────────────────────────
  test('TC7: POST /api/eta → 200, eta > 0', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/eta')
        .send({ distance_km: 5, traffic_level: 0.5 })
    );

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;
    const eta = body.eta;

    expect(eta).toBeDefined();
    expect(eta).toBeGreaterThan(0);

    console.log(`  ✅ TC7: ETA = ${eta} minutes`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 8: Pricing API
  // ────────────────────────────────────────────────────────────
  test('TC8: POST /api/pricing/calculate → 200, price > 15000', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/pricing/calculate')
        .send({ distance_km: 5, demand_index: 1.0 })
    );

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    expect(body.price).toBeDefined();
    expect(body.price).toBeGreaterThan(15000);
    expect(body.surge).toBeGreaterThanOrEqual(1);

    console.log(`  ✅ TC8: price = ${body.price}, surge = ${body.surge}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 9: Notification
  // ────────────────────────────────────────────────────────────
  test('TC9: POST /api/notification/send → 200, sent = true', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/notification/send')
        .send({ user_id: 'USR123', message: 'Your ride is confirmed' })
    );

    expect(res.status).toBe(200);
    const body = res.body.data || res.body;

    expect(body.sent).toBe(true);

    console.log(`  ✅ TC9: sent = ${body.sent}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 10: Logout + Verify Token Blacklist
  // ────────────────────────────────────────────────────────────
  test('TC10: POST /api/auth/logout → 200, token bị blacklist', async () => {
    expect(accessToken).toBeDefined();

    // Bước 1: Logout
    const logoutRes = await request(API_BASE)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect('Content-Type', /json/)
      .expect(200);

    const logoutBody = logoutRes.body.data || logoutRes.body;
    expect(logoutBody.message).toContain('successfully');

    console.log(`  ✅ TC10a: Logout → "${logoutBody.message}"`);

    // Bước 2: Verify — gọi lại API với token đã logout → 401
    const verifyRes = await request(API_BASE)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(verifyRes.body.success).toBe(false);

    console.log(`  ✅ TC10b: Token blacklisted → 401 Unauthorized`);
  });
});
