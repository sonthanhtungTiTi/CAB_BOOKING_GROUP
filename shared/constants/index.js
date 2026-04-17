// ─── User Roles ──────────────────────────────────────────────
const UserRole = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  ADMIN: 'ADMIN',
});

// ─── Service URLs (internal microservice endpoints) ──────────
const SERVICE_URLS = {
  AUTH_SERVICE: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:4001',
  USER_SERVICE: process.env.USER_SERVICE_URL || 'http://127.0.0.1:4002',
  DRIVER_SERVICE: process.env.DRIVER_SERVICE_URL || 'http://127.0.0.1:4003',
  BOOKING_SERVICE: process.env.BOOKING_SERVICE_URL || 'http://127.0.0.1:4004',
  RIDE_SERVICE: process.env.RIDE_SERVICE_URL || 'http://127.0.0.1:4005',
  PRICING_SERVICE: process.env.PRICING_SERVICE_URL || 'http://127.0.0.1:4006',
  PAYMENT_SERVICE: process.env.PAYMENT_SERVICE_URL || 'http://127.0.0.1:4007',
  REVIEW_SERVICE: process.env.REVIEW_SERVICE_URL || 'http://127.0.0.1:3008',
};

// ─── Kafka Topics ────────────────────────────────────────────
const KAFKA_TOPICS = Object.freeze({
  // Auth events
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_UPDATED: 'user.updated',

  // Booking & Ride events
  RIDE_CREATED: 'ride.created',
  RIDE_ASSIGNED: 'ride.assigned',
  RIDE_MATCHING_FAILED: 'ride.matching.failed',
  RIDE_ACCEPTED: 'ride.accepted',
  RIDE_STARTED: 'ride.started',
  RIDE_COMPLETED: 'ride.completed',
  RIDE_CANCELLED: 'ride.cancelled',

  // Location events
  DRIVER_LOCATION_UPDATED: 'driver.location.updated',

  // Ride lifecycle events (Phase 6)
  RIDE_STATUS_UPDATED: 'ride.status.updated',
  RIDE_PRICED: 'ride.priced',

  // Payment events
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_COMPLETED: 'payment.completed',
  PAYMENT_FAILED: 'payment.failed',
});

// ─── Booking Status (State Machine) ──────────────────────────
const BookingStatus = Object.freeze({
  PENDING: 'PENDING',
  ASSIGNED: 'ASSIGNED',
  PICKUP: 'PICKUP',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_DRIVER: 'NO_DRIVER',
});

// Allowed transitions: currentStatus → [nextStatuses]
const ALLOWED_TRANSITIONS = Object.freeze({
  ASSIGNED: ['PICKUP'],
  PICKUP: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
});

// ─── Error Codes ─────────────────────────────────────────────
const ERROR_CODES = Object.freeze({
  // Auth errors
  INVALID_CREDENTIALS: 'AUTH_001',
  USER_ALREADY_EXISTS: 'AUTH_002',
  USER_NOT_FOUND: 'AUTH_003',
  TOKEN_EXPIRED: 'AUTH_004',
  TOKEN_INVALID: 'AUTH_005',
  UNAUTHORIZED: 'AUTH_006',
  FORBIDDEN: 'AUTH_007',

  // Validation errors
  VALIDATION_ERROR: 'VAL_001',

  // Booking errors
  INVALID_STATUS_TRANSITION: 'BOOK_001',
  DRIVER_MISMATCH: 'BOOK_002',
  BOOKING_NOT_FOUND: 'BOOK_003',

  // General errors
  INTERNAL_ERROR: 'SYS_001',
  SERVICE_UNAVAILABLE: 'SYS_002',
  REQUEST_TIMEOUT: 'SYS_003',
});

module.exports = {
  UserRole,
  SERVICE_URLS,
  KAFKA_TOPICS,
  BookingStatus,
  ALLOWED_TRANSITIONS,
  ERROR_CODES,
};
