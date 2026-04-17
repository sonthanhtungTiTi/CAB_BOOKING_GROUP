const { redis } = require('shared');
const { kafka } = require('shared');
const { KAFKA_TOPICS } = require('shared/constants');
const { AppError } = require('shared/middlewares/errorHandler');

// ─── Redis Keys ──────────────────────────────────────────────
const DRIVERS_GEO_KEY = 'drivers:locations';
const DRIVER_ACTIVE_PREFIX = 'driver:active:'; // TTL heartbeat key
const DRIVER_ACTIVE_TTL = 60; // Tự hủy sau 60s nếu mất tín hiệu

/**
 * Cập nhật vị trí GPS của tài xế vào Redis Geo.
 *
 * Lệnh Redis: GEOADD drivers:locations <lng> <lat> <driverId>
 * Lưu ý: Redis Geo nhận tham số theo thứ tự (longitude, latitude).
 *
 * Đồng thời đặt key heartbeat `driver:active:<id>` với TTL 60s.
 * Nếu tài xế ngừng gửi tọa độ > 60s, key tự hủy → bị lọc ra khỏi
 * kết quả findNearbyDrivers, diệt "bóng ma" hoàn toàn.
 *
 * @param {string} driverId - UUID của tài xế
 * @param {number} lat      - Vĩ độ (latitude)
 * @param {number} lng      - Kinh độ (longitude)
 */
async function updateDriverLocation(driverId, lat, lng) {
  const redisClient = redis.getRedisClient();

  // Pipeline: GEOADD + SET heartbeat trong 1 round-trip
  const pipeline = redisClient.pipeline();
  pipeline.geoadd(DRIVERS_GEO_KEY, lng, lat, driverId);
  pipeline.set(`${DRIVER_ACTIVE_PREFIX}${driverId}`, '1', 'EX', DRIVER_ACTIVE_TTL);
  await pipeline.exec();

  // Publish event lên Kafka (non-blocking)
  try {
    await kafka.publishEvent(
      KAFKA_TOPICS.DRIVER_LOCATION_UPDATED,
      {
        driverId,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      },
      driverId, // partition key = driverId để đảm bảo thứ tự
    );
  } catch (err) {
    // Non-blocking: không để Kafka lỗi làm gãy luồng chính
    console.error('[Ride] Failed to publish location event:', err.message);
  }

  return { driverId, lat, lng, stored: true };
}

/**
 * Tìm các tài xế trong bán kính quanh một tọa độ.
 *
 * Sau khi lấy danh sách từ GEORADIUS, dùng pipeline MGET để kiểm tra
 * heartbeat key `driver:active:<id>`. Chỉ trả về tài xế mà key vẫn
 * còn tồn tại (= đang thực sự online). Tài xế hết TTL sẽ bị ZREM
 * khỏi GeoSet để giữ dữ liệu sạch.
 *
 * @param {number} lat    - Vĩ độ tâm tìm kiếm
 * @param {number} lng    - Kinh độ tâm tìm kiếm
 * @param {number} radius - Bán kính tìm kiếm (km)
 * @returns {Array<{driverId, distance, lat, lng}>}
 */
async function findNearbyDrivers(lat, lng, radius) {
  const redisClient = redis.getRedisClient();

  // GEORADIUS key longitude latitude radius km WITHCOORD WITHDIST ASC COUNT 20
  const results = await redisClient.georadius(
    DRIVERS_GEO_KEY,
    lng,
    lat,
    radius,
    'km',
    'WITHCOORD',
    'WITHDIST',
    'ASC',
    'COUNT',
    20,
  );

  if (results.length === 0) return [];

  // Parse kết quả thô: mỗi item = [driverId, distance, [lng, lat]]
  const candidates = results.map((item) => ({
    driverId: item[0],
    distance: parseFloat(item[1]),
    lng: parseFloat(item[2][0]),
    lat: parseFloat(item[2][1]),
  }));

  // Pipeline MGET: kiểm tra heartbeat key của tất cả ứng viên trong 1 round-trip
  const heartbeatKeys = candidates.map((c) => `${DRIVER_ACTIVE_PREFIX}${c.driverId}`);
  const heartbeatValues = await redisClient.mget(...heartbeatKeys);

  const activeDrivers = [];
  const staleDriverIds = [];

  for (let i = 0; i < candidates.length; i++) {
    if (heartbeatValues[i] !== null) {
      // Tài xế vẫn đang active — giữ lại
      activeDrivers.push(candidates[i]);
    } else {
      // "Bóng ma" — key đã hết TTL, đánh dấu để dọn dẹp
      staleDriverIds.push(candidates[i].driverId);
    }
  }

  // Dọn rác: ZREM các tài xế bóng ma khỏi GeoSet (non-blocking, fire-and-forget)
  if (staleDriverIds.length > 0) {
    redisClient.zrem(DRIVERS_GEO_KEY, ...staleDriverIds).catch((err) => {
      console.error('[Ride] Failed to clean stale drivers from GeoSet:', err.message);
    });
    console.log(`[Ride] Cleaned ${staleDriverIds.length} ghost driver(s) from GeoSet`);
  }

  return activeDrivers;
}

/**
 * Xóa vị trí tài xế khỏi Redis (khi offline).
 * Xóa cả GeoSet entry lẫn heartbeat key.
 */
async function removeDriverLocation(driverId) {
  const redisClient = redis.getRedisClient();
  const pipeline = redisClient.pipeline();
  pipeline.zrem(DRIVERS_GEO_KEY, driverId);
  pipeline.del(`${DRIVER_ACTIVE_PREFIX}${driverId}`);
  await pipeline.exec();
  return { driverId, removed: true };
}

module.exports = {
  updateDriverLocation,
  findNearbyDrivers,
  removeDriverLocation,
};

