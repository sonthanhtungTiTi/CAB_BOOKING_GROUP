/**
 * contextBuilder.js — Thu thập context thực tế từ Redis + hệ thống
 * Dùng cho AI Agent khi matching driver cho một ride.
 */

async function buildRideContext(rideData) {
  const { ride_id, pickupLat, pickupLng, destLat, destLng, distance_km } = rideData;

  let available_drivers = [];
  let traffic_level = 0.3; // default moderate traffic

  // Fetch drivers thực tế từ Redis GEORADIUS
  try {
    const path = require('path');
    const { getRedisClient } = require(path.resolve(__dirname, '../../../../infra/redis/redisClient'));
    const redis = getRedisClient();

    const keyExists = await redis.exists('driver_locations');
    if (keyExists) {
      // GEORADIUS trả về danh sách driver trong bán kính 15km kèm khoảng cách
      const drivers = await redis.georadius(
        'driver_locations', pickupLng, pickupLat, 15, 'km', 'WITHCOORD', 'WITHDIST', 'ASC'
      );

      // Format: [[name, dist, [lng, lat]], ...]
      available_drivers = drivers.map(d => ({
        driver_id: d[0],
        distance_km: parseFloat(d[1]),
        lng: parseFloat(d[2][0]),
        lat: parseFloat(d[2][1]),
      }));
    }
  } catch (err) {
    console.error('[AI/Context] Redis GEORADIUS error:', err.message);
  }

  // Supply/Demand index dựa trên số lượng tài xế
  const supply_index = Math.max(available_drivers.length, 1);
  const demand_index = 1; // baseline demand

  const context = {
    ride_id,
    pickup: { lat: pickupLat, lng: pickupLng },
    drop: { lat: destLat, lng: destLng },
    available_drivers,
    traffic_level,
    demand_index,
    supply_index,
    distance_km: distance_km || 0,
    timestamp: new Date().toISOString(),
  };

  console.log(`[AI/Context] Built context for ride ${ride_id}: ${available_drivers.length} drivers available`);
  return context;
}

module.exports = { buildRideContext };
