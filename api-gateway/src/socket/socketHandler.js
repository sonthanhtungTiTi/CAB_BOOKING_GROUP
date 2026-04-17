const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { SERVICE_URLS, UserRole } = require('shared/constants');
const { redis } = require('shared');

const RIDE_SERVICE = SERVICE_URLS.RIDE_SERVICE;

// ─── Connected Users Registry ────────────────────────────────
// Map<userId, Set<socketId>> — hỗ trợ multi-device
const connectedUsers = new Map();

// ─── Anti-DoS: In-memory Rate Limiter cho GPS updates ────────
// Map<driverId, lastTimestamp> — throttle tối thiểu 2 giây/lần
const locationUpdateLimits = new Map();
const LOCATION_THROTTLE_MS = 2000;

function addConnectedUser(userId, socketId) {
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socketId);
  console.log(`[Registry] User ${userId} added socket ${socketId} (total: ${connectedUsers.get(userId).size})`);
}

function removeConnectedUser(userId, socketId) {
  if (connectedUsers.has(userId)) {
    connectedUsers.get(userId).delete(socketId);
    if (connectedUsers.get(userId).size === 0) {
      connectedUsers.delete(userId);
    }
  }
}

function getSocketIds(userId) {
  return connectedUsers.get(userId) || new Set();
}

// ─── JWT Auth Middleware (cho mọi role) ──────────────────────
function socketAuthMiddleware(socket, next) {
  try {
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;

    if (!authHeader) {
      return next(new Error('Authentication required: token missing'));
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    const secret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';
    const decoded = jwt.verify(token, secret);

    socket.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    console.log(`[WS] Authenticated: ${decoded.email} (${decoded.role})`);
    next();
  } catch (err) {
    console.error('[WS] Auth failed:', err.message);
    next(new Error('Authentication failed: ' + err.message));
  }
}

// ─── Driver-only Auth Middleware ─────────────────────────────
function driverOnlyMiddleware(socket, next) {
  if (socket.user?.role !== UserRole.DRIVER) {
    return next(new Error('Forbidden: only DRIVER role can connect to /drivers'));
  }
  next();
}

/**
 * Khởi tạo Socket.io server, gắn vào HTTP server hiện có.
 * - Namespace /drivers: chỉ DRIVER — GPS tracking
 * - Namespace /notifications: mọi role — nhận thông báo real-time
 * - Redis Subscriber: lắng nghe channel 'notifications' để route tới đúng socket
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ═══════════════════════════════════════════════════════════
  // NAMESPACE /drivers — GPS Tracking (DRIVER only)
  // ═══════════════════════════════════════════════════════════
  const driversNs = io.of('/drivers');
  driversNs.use(socketAuthMiddleware);
  driversNs.use(driverOnlyMiddleware);

  driversNs.on('connection', (socket) => {
    const driverId = socket.user.id;
    addConnectedUser(driverId, socket.id);
    console.log(`[WS:/drivers] Driver connected: ${socket.user.email} | Socket: ${socket.id}`);

    // ─── Event: driver:update_location (Rate-limited + Redis Pub/Sub) ─
    socket.on('driver:update_location', (data) => {
      // ── Anti-DoS Throttle: Tối thiểu 2s giữa 2 lần gửi ──
      const now = Date.now();
      const lastUpdate = locationUpdateLimits.get(driverId) || 0;
      if (now - lastUpdate < LOCATION_THROTTLE_MS) {
        return; // Âm thầm drop — không phản hồi để tiết kiệm băng thông
      }
      locationUpdateLimits.set(driverId, now);

      const { lat, lng } = data || {};
      if (lat == null || lng == null) {
        socket.emit('error', { message: 'lat and lng are required' });
        return;
      }

      // ── Publish qua Redis Pub/Sub thay vì HTTP ──────────────
      // Ride Service sẽ subscribe channel này và ghi vào GeoSet.
      // Tốc độ: ~0.1ms (Redis in-memory) vs ~5-30ms (HTTP round-trip).
      const redisPublisher = redis.getRedisPublisher();
      const payload = JSON.stringify({
        driverId,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timestamp: Date.now(),
      });

      redisPublisher.publish('driver:location:updates', payload).catch((err) => {
        console.error(`[WS] Redis publish failed for ${driverId}:`, err.message);
      });

      // Phản hồi ngay lập tức — fire-and-forget
      socket.emit('location:updated', { success: true });
    });

    // ─── Event: driver:go_offline ──────────────────────────
    socket.on('driver:go_offline', async () => {
      try {
        await axios.delete(`${RIDE_SERVICE}/api/internal/locations/${driverId}`);
        locationUpdateLimits.delete(driverId); // Dọn bộ nhớ rate-limiter
        console.log(`[WS] Driver went offline: ${driverId}`);
        socket.emit('status:offline', { success: true });
      } catch (err) {
        console.error(`[WS] Go offline failed for ${driverId}:`, err.message);
      }
    });

    // ─── Disconnect ────────────────────────────────────────
    // KHÔNG xóa tọa độ khi rớt mạng tạm thời (Ping timeout/Chuyển Tab).
    // Tài xế "bóng ma" sẽ bị BƯỚC 2 (TTL key driver:active:*) tự dọn dẹp.
    // Chỉ xóa khi tài xế chủ động gọi 'driver:go_offline'.
    socket.on('disconnect', (reason) => {
      removeConnectedUser(driverId, socket.id);
      console.log(`[WS:/drivers] Driver disconnected: ${socket.user.email} | Reason: ${reason}`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // NAMESPACE /notifications — Real-time Notifications (ALL roles)
  // ═══════════════════════════════════════════════════════════
  const notifyNs = io.of('/notifications');
  notifyNs.use(socketAuthMiddleware);

  notifyNs.on('connection', (socket) => {
    const userId = socket.user.id;
    addConnectedUser(userId, socket.id);
    console.log(`[WS:/notifications] User connected: ${socket.user.email} (${socket.user.role}) | Socket: ${socket.id}`);

    socket.emit('connected', { message: 'Connected to notification channel', userId });

    socket.on('disconnect', (reason) => {
      removeConnectedUser(userId, socket.id);
      console.log(`[WS:/notifications] User disconnected: ${socket.user.email} | Reason: ${reason}`);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // REDIS SUBSCRIBER — Bridge: Redis Pub/Sub → Socket.io
  // ═══════════════════════════════════════════════════════════
  const redisSub = redis.getRedisSubscriber();

  redisSub.subscribe('notifications', (err, count) => {
    if (err) {
      console.error('[WS] Failed to subscribe to Redis channel:', err.message);
    } else {
      console.log(`[WS] Subscribed to Redis channel "notifications" (${count} channel(s))`);
    }
  });

  redisSub.on('message', (channel, rawMessage) => {
    if (channel !== 'notifications') return;

    try {
      const payload = JSON.parse(rawMessage);
      const { targetUserId, message, type, data } = payload;

      if (!targetUserId) {
        console.warn('[WS] Notification missing targetUserId, skipping');
        return;
      }

      const socketIds = getSocketIds(targetUserId);

      if (socketIds.size === 0) {
        console.log(`[WS] User ${targetUserId} is offline — notification stored for later`);
        return;
      }

      // Gửi notification tới tất cả socket của user (multi-device)
      for (const sid of socketIds) {
        notifyNs.to(sid).emit('notification', {
          type: type || 'GENERAL',
          message,
          data: data || null,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`[WS] Notification sent to ${targetUserId} (${socketIds.size} socket(s)): ${message}`);
    } catch (err) {
      console.error('[WS] Failed to parse notification from Redis:', err.message);
    }
  });

  console.log('[WS] Socket.io server initialized — /drivers + /notifications');
  return io;
}

module.exports = { initSocketServer };
