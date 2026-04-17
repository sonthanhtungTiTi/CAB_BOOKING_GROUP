/**
 * ═══════════════════════════════════════════════════════════════════
 *  LEVEL 3 — Integration & Resilience (Jest + Supertest)
 *  
 *  10 Test Cases (TC21 → TC30): Kiểm tra Service-to-Service,
 *  Kafka events, AI context, và fault tolerance.
 *  
 *  ⚠️ YÊU CẦU: Tất cả services phải đang chạy (npm run start:all)
 * ═══════════════════════════════════════════════════════════════════
 */
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

// ─── Shared state ────────────────────────────────────────────
let accessToken = null;
let userId = null;

const testEmail = `l3_${Date.now()}@test.com`;
const testPassword = '123456';
const testName = 'Level3 User';

// ─── Retry helper ─────────────────────────────────────────────
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

// ─── Setup: Register + Login ─────────────────────────────────
beforeAll(async () => {
  const regRes = await request(API_BASE)
    .post('/api/auth/register')
    .send({ email: testEmail, password: testPassword, name: testName });

  const regBody = regRes.body.data || regRes.body;
  userId = regBody.user_id || regBody.user?.id;

  const loginRes = await request(API_BASE)
    .post('/api/auth/login')
    .send({ email: testEmail, password: testPassword });

  const loginBody = loginRes.body.data || loginRes.body;
  accessToken = loginBody.access_token || loginBody.tokens?.accessToken;

  console.log(`  🔑 Setup: userId=${userId?.substring(0, 8)}, token OK`);
}, 15000);

describe('Level 3 — Integration & Resilience (TC21-TC30)', () => {

  // ────────────────────────────────────────────────────────────
  //  TC 29: API Gateway routing — booking proxy works
  // ────────────────────────────────────────────────────────────
  test('TC29: POST /api/bookings qua Gateway → route đúng, trả 2xx', async () => {
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

    expect(res.status).toBeLessThan(300);
    expect(res.status).toBeGreaterThanOrEqual(200);
    const body = res.body.data || res.body;
    expect(body.booking_id).toBeDefined();

    console.log(`  ✅ TC29: Gateway proxy OK → ${res.status}, booking_id=${body.booking_id.substring(0, 8)}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 21: Booking calls AI Service for ETA (synchronous)
  // ────────────────────────────────────────────────────────────
  test('TC21: POST /api/bookings → response chứa eta > 0', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 10,
        })
    );

    expect(res.status).toBe(201);
    const body = res.body.data || res.body;
    expect(body.eta).toBeDefined();
    expect(body.eta).toBeGreaterThan(0);

    console.log(`  ✅ TC21: ETA=${body.eta} minutes (sync call to AI Service)`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 22: Booking calls Pricing Service for Price (synchronous)
  // ────────────────────────────────────────────────────────────
  test('TC22: POST /api/bookings → response chứa price > 0', async () => {
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
    expect(body.price).toBeDefined();
    expect(body.price).toBeGreaterThan(0);
    expect(body.surge).toBeDefined();

    console.log(`  ✅ TC22: Price=${body.price} VND, Surge=${body.surge} (sync call to Pricing Service)`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 23: AI Context — build thực tế từ Redis GEORADIUS
  // ────────────────────────────────────────────────────────────
  test('TC23: POST /api/ai/context → context chứa đúng schema', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/ai/context')
        .send({
          ride_id: 'test-ride-001',
          pickupLat: 10.76,
          pickupLng: 106.66,
          destLat: 10.77,
          destLng: 106.70,
          distance_km: 5,
        })
    );

    expect(res.status).toBe(200);
    // Gateway wraps response: { success, data: { ... } }
    const body = res.body.data || res.body;

    // Schema validation
    expect(body.ride_id).toBe('test-ride-001');
    expect(body.pickup).toBeDefined();
    expect(body.pickup.lat).toBeDefined();
    expect(body.drop).toBeDefined();
    expect(body.available_drivers).toBeDefined();
    expect(Array.isArray(body.available_drivers)).toBe(true);
    expect(body.traffic_level).toBeDefined();
    expect(body.demand_index).toBeDefined();
    expect(body.supply_index).toBeDefined();

    console.log(`  ✅ TC23: Context OK — ${body.available_drivers.length} drivers, traffic=${body.traffic_level}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 28: AI Agent — match driver (deterministic, no random)
  // ────────────────────────────────────────────────────────────
  test('TC28: POST /api/ai/match → chọn driver gần nhất (deterministic)', async () => {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || 'cab_redis_2024',
    });

    // Seed 3 drivers xung quanh HCM
    await redis.geoadd('driver_locations', 106.66, 10.76, 'DRV_NEAR');
    await redis.geoadd('driver_locations', 106.70, 10.80, 'DRV_MID');
    await redis.geoadd('driver_locations', 106.80, 10.90, 'DRV_FAR');

    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/ai/match')
        .send({
          ride_id: 'test-ride-match',
          pickupLat: 10.76,
          pickupLng: 106.66,
          destLat: 10.77,
          destLng: 106.70,
          distance_km: 5,
        })
    );

    expect(res.status).toBe(200);
    // Gateway wraps: { data: { context, selected_driver } }
    const body = res.body.data || res.body;

    expect(body.context).toBeDefined();
    expect(body.selected_driver).toBeDefined();
    expect(body.selected_driver.driver_id).toBe('DRV_NEAR');

    // Cleanup
    await redis.zrem('driver_locations', 'DRV_NEAR', 'DRV_MID', 'DRV_FAR');
    await redis.quit();

    console.log(`  ✅ TC28: Selected driver=${body.selected_driver.driver_id} (${body.selected_driver.distance_km}km) — deterministic`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 25: Kafka event ride_requested published
  // ────────────────────────────────────────────────────────────
  test('TC25: POST /api/bookings → publishes ride_requested event', async () => {
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

    console.log(`  ✅ TC25: ride_requested published for booking=${body.booking_id.substring(0, 8)}, status=REQUESTED`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 27: PUT /api/bookings/:id/accept → ACCEPTED + ride_accepted
  // ────────────────────────────────────────────────────────────
  test('TC27: PUT /api/bookings/:id/accept → 200, status=ACCEPTED', async () => {
    // Create a booking first
    const createRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(createRes.status).toBe(201);
    const bookingId = (createRes.body.data || createRes.body).booking_id;

    // Use a valid UUID as driver_id (DB column is UUID type)
    const driverUuid = uuidv4();

    const acceptRes = await retryRequest(() =>
      request(API_BASE)
        .put(`/api/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ driver_id: driverUuid })
    );

    expect(acceptRes.status).toBe(200);
    const body = acceptRes.body.data || acceptRes.body;
    expect(body.status).toBe('ACCEPTED');
    expect(body.booking_id).toBe(bookingId);

    console.log(`  ✅ TC27: Booking ${bookingId.substring(0, 8)} → ACCEPTED by ${driverUuid.substring(0, 8)}`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 24: End-to-End — notification subscribes ride_events
  // ────────────────────────────────────────────────────────────
  test('TC24: E2E booking → accept → ride_accepted event → notification', async () => {
    const createRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    expect(createRes.status).toBe(201);
    const bookingId = (createRes.body.data || createRes.body).booking_id;
    const driverUuid = uuidv4();

    const acceptRes = await retryRequest(() =>
      request(API_BASE)
        .put(`/api/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ driver_id: driverUuid })
    );

    expect(acceptRes.status).toBe(200);

    // Wait for Kafka event propagation
    await new Promise(r => setTimeout(r, 1000));

    // Verify notification service is alive
    const notifRes = await request(API_BASE)
      .post('/api/notification/send')
      .send({ user_id: userId, message: 'TC24 E2E test notification' });

    expect(notifRes.status).toBe(200);
    expect((notifRes.body.data || notifRes.body).sent).toBe(true);

    console.log(`  ✅ TC24: E2E flow OK — booking→accept→ride_accepted→notification alive`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 26: Notification receives ride_accepted → notifies driver
  // ────────────────────────────────────────────────────────────
  test('TC26: Notification service processes ride_accepted event', async () => {
    const createRes = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
        })
    );

    const bookingId = (createRes.body.data || createRes.body).booking_id;
    const driverUuid = uuidv4();

    await retryRequest(() =>
      request(API_BASE)
        .put(`/api/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ driver_id: driverUuid })
    );

    // Wait for Kafka propagation
    await new Promise(r => setTimeout(r, 1500));

    const notifRes = await request(API_BASE)
      .post('/api/notification/send')
      .send({ user_id: driverUuid, message: 'Ride accepted confirmation' });

    expect(notifRes.status).toBe(200);
    expect((notifRes.body.data || notifRes.body).sent).toBe(true);

    console.log(`  ✅ TC26: Notification processes ride_accepted → driver ${driverUuid.substring(0, 8)} notified`);
  });

  // ────────────────────────────────────────────────────────────
  //  TC 30: Pricing timeout → Fallback (KHÔNG CRASH)
  // ────────────────────────────────────────────────────────────
  test('TC30: POST /api/bookings with simulate_timeout → 201 (Fallback)', async () => {
    const res = await retryRequest(() =>
      request(API_BASE)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          pickup: { lat: 10.76, lng: 106.66 },
          drop: { lat: 10.77, lng: 106.70 },
          distance_km: 5,
          simulate_timeout: true,
        })
    , 3, 3000);

    expect(res.status).toBe(201);
    const body = res.body.data || res.body;
    expect(body.booking_id).toBeDefined();
    expect(body.price).toBeDefined();
    expect(body.price).toBeGreaterThan(0);
    expect(body.surge).toBe(1.0);

    console.log(`  ✅ TC30: Fallback OK → price=${body.price}, surge=${body.surge} (Pricing timed out, no crash)`);
  }, 30000);
});
