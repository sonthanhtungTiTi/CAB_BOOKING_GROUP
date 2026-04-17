-- ═══════════════════════════════════════════════════════════════
--  PostgreSQL Init Script
--  Tạo tất cả databases cần thiết cho các microservices.
--  File này được Docker tự động chạy khi container khởi tạo lần đầu.
-- ═══════════════════════════════════════════════════════════════

-- cab_auth_db đã được tạo bởi POSTGRES_DB env var
-- Tạo các database còn lại:

CREATE DATABASE cab_booking_db;
CREATE DATABASE cab_user_db;
CREATE DATABASE cab_driver_db;
CREATE DATABASE cab_pricing_db;
CREATE DATABASE cab_payment_db;
