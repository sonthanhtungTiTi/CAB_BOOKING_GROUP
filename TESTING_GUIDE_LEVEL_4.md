# 🏦 TESTING GUIDE - CAB BOOKING SYSTEM (LEVEL 4)

Tài liệu hướng dẫn nghiệm thu Level 4 (TC31 - TC40) — **Transaction & Data Consistency**. Level này đặc biệt tập trung vào tính toàn vẹn dữ liệu trong hệ thống phân tán, bao gồm ACID Transaction, Outbox Pattern, Saga/Compensation, và xử lý Race Condition.

**Nguyên tắc tối thượng:** Tuyệt đối KHÔNG fake data, KHÔNG dùng `Math.random()`. Mọi transaction đều sử dụng `BEGIN/COMMIT/ROLLBACK` thật của PostgreSQL. Mọi event đều đi qua Kafka thật.

---

## 🛠️ 1. Chuẩn bị môi trường

```bash
# 1. Khởi động hạ tầng Docker
docker-compose up -d

# 2. Cài đặt dependencies (nếu chưa)
npm install

# 3. Khởi động tất cả services
npm run start:all
```

Chờ khoảng 15-20 giây cho đến khi thấy log:
```
[BookingDB] bookings table is ready
[BookingDB] outbox_events table is ready
[Outbox] Background publisher started (interval: 2000ms)
[BookingConsumer] Kafka consumer started — listening for ride.assigned, ride.matching.failed, payment.failed
```

---

## 🧪 2. Chạy Test Suite Level 4

```bash
npm run test:level4
```

Kết quả mong đợi: **10/10 PASS**. Tất cả 40 TC (Level 1-4) đã được tích hợp vào GitHub Actions CI/CD.

---

## 📋 3. Chi tiết Test Cases theo Cấu trúc Chuẩn (TC31 - TC40)

### TC31: ACID Transaction COMMIT thành công
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5
  }
  ```
* **Kết quả mong đợi:** HTTP `201 Created`, response có `booking_id`; kiểm tra DB có đúng 1 row với `status = "REQUESTED"`
* **Ý nghĩa kết quả:** Chứng minh transaction booking được commit hoàn chỉnh, dữ liệu nhất quán sau khi tạo cuốc xe.

### TC32: ROLLBACK khi lỗi DB
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5,
    "simulate_db_error": true
  }
  ```
  Header: `Idempotency-Key: rollback-test-...`
* **Kết quả mong đợi:** HTTP `500`, message chứa `rolled back`; truy vấn theo idempotency key trả về `0 rows`
* **Ý nghĩa kết quả:** Xác nhận atomicity: có lỗi thì rollback toàn bộ, không để lại dữ liệu dở dang.

### TC33: Payment thất bại
* **Endpoint:** `POST /api/payment/process`
* **Data JSON nhập vào để test:**
  ```json
  {
    "bookingId": "<booking_id>",
    "customerId": "<user_id>",
    "amount": 65000,
    "paymentMethod": "CREDIT_CARD",
    "simulate_payment_fail": true
  }
  ```
* **Kết quả mong đợi:** HTTP `400`, message chứa `declined`
* **Ý nghĩa kết quả:** Xác nhận nhánh thất bại thanh toán hoạt động đúng để kích hoạt flow saga bù trừ ở bước sau.

### TC34: Idempotency chống tạo trùng
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5
  }
  ```
  Header dùng cùng một `Idempotency-Key` cho 2 lần gọi
* **Kết quả mong đợi:** Lần 1 `201`, lần 2 `200`, cùng `booking_id`; DB chỉ có `1` row theo key đó
* **Ý nghĩa kết quả:** Bảo vệ hệ thống trước duplicate submit/retry từ client.

### TC35: Race condition với request đồng thời
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5
  }
  ```
  Hai request bắn cùng lúc với cùng `Idempotency-Key`
* **Kết quả mong đợi:** Hai response trả cùng `booking_id`; DB chỉ có `1` booking theo key
* **Ý nghĩa kết quả:** Xác nhận cơ chế lock/idempotency chống race condition hiệu quả trong tải đồng thời.

### TC36: Payment thành công
* **Endpoint:** `POST /api/payment/process`
* **Data JSON nhập vào để test:**
  ```json
  {
    "bookingId": "<booking_id>",
    "customerId": "<user_id>",
    "amount": 65000,
    "paymentMethod": "CREDIT_CARD"
  }
  ```
* **Kết quả mong đợi:** HTTP `201`, response có `status = "SUCCESS"`
* **Ý nghĩa kết quả:** Chứng minh nhánh thanh toán thành công hoàn tất đúng nghiệp vụ.

### TC37: Saga compensation tự động CANCELLED
* **Endpoint:**
  1. `POST /api/bookings`
  2. `POST /api/payment/process` (fail)
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5
  }
  ```
  ```json
  {
    "bookingId": "<booking_id>",
    "customerId": "<user_id>",
    "amount": 65000,
    "paymentMethod": "CREDIT_CARD",
    "simulate_payment_fail": true
  }
  ```
* **Kết quả mong đợi:** Sau vài giây polling DB, `status` booking chuyển thành `CANCELLED`
* **Ý nghĩa kết quả:** Chứng minh saga bù trừ hoạt động, hệ thống tự sửa nhất quán dữ liệu sau thất bại liên service.

### TC38: Outbox Pattern ghi event cùng transaction
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5
  }
  ```
* **Kết quả mong đợi:** HTTP `201`; số row `outbox_events` tăng; row mới có `topic = "ride_events"` và payload chứa `ride_id` khớp `booking_id`
* **Ý nghĩa kết quả:** Tránh dual-write inconsistency bằng cách ghi business data và event trong cùng transaction.

### TC39: Partial failure không bị treo
* **Endpoint:** `POST /api/payment/process`
* **Data JSON nhập vào để test:**
  ```json
  {
    "bookingId": "<booking_id>",
    "customerId": "<user_id>",
    "amount": 65000,
    "paymentMethod": "CREDIT_CARD",
    "simulate_payment_fail": true
  }
  ```
* **Kết quả mong đợi:** Response trả về nhanh `< 5 giây`, status `400` (không treo request)
* **Ý nghĩa kết quả:** Xác nhận timeout/failure được xử lý fail-fast, không gây nghẽn luồng gọi API.

### TC40: Rollback nhiều lần, DB vẫn sạch
* **Endpoint:** `POST /api/bookings` (gọi 3 lần)
* **Data JSON nhập vào để test:**
  ```json
  {
    "pickup": { "lat": 10.76, "lng": 106.66 },
    "drop": { "lat": 10.77, "lng": 106.70 },
    "distance_km": 5,
    "simulate_db_error": true
  }
  ```
  Mỗi lần gọi dùng `Idempotency-Key` khác nhau
* **Kết quả mong đợi:** Query DB theo các key đó trả về `0 rows`
* **Ý nghĩa kết quả:** Chứng minh tính nhất quán dữ liệu ổn định theo thời gian, rollback lặp nhiều lần vẫn không tạo orphan data.

---

## 🏗️ 4. Kiến trúc tổng quan Level 4

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Client     │────▶│   API Gateway    │────▶│  Booking Service  │
│  (Postman)   │     │ (Rate Limit,     │     │  (ACID TX,        │
│              │     │  Auth, Proxy)    │     │   Outbox Pattern) │
└─────────────┘     └──────────────────┘     └───────┬───────────┘
                                                      │
                                        ┌─────────────┼─────────────┐
                                        ▼             │             ▼
                                ┌──────────────┐      │     ┌──────────────┐
                                │  PostgreSQL  │      │     │    Redis     │
                                │  (bookings + │      │     │  (SETNX Lock │
                                │   outbox)    │      │     │  Idempotency)│
                                └──────────────┘      │     └──────────────┘
                                                      │
                                                      ▼ (Kafka)
                                        ┌─────────────────────────┐
                                        │     Payment Service     │
                                        │  (simulate_payment_fail)│
                                        └────────────┬────────────┘
                                                     │
                                            payment.failed event
                                                     │
                                                     ▼ (Kafka Consumer)
                                        ┌─────────────────────────┐
                                        │   Booking Consumer      │
                                        │  → CANCEL booking       │
                                        │  (Saga Compensation)    │
                                        └─────────────────────────┘
```

---

## 🎯 5. Tổng kết

| Level | Chủ đề | Số TC | Trạng thái |
|-------|--------|-------|------------|
| 1 | Basic API & Flow | 10 | ✅ PASS |
| 2 | Validation & Edge Cases | 10 | ✅ PASS |
| 3 | Integration & Resilience | 10 | ✅ PASS |
| 4 | Transaction & Data Consistency | 10 | ✅ PASS |
| **Tổng** | | **40** | **✅ ALL PASS** |

**Hệ thống CAB đã đạt trình độ Enterprise-Grade với:**
- ✅ ACID Transaction thật (PostgreSQL BEGIN/COMMIT/ROLLBACK)
- ✅ Outbox Pattern chống Dual-Write
- ✅ Saga Pattern tự động bù trừ khi thanh toán thất bại
- ✅ Redis SETNX Lock chống Race Condition
- ✅ Idempotency toàn diện (Redis + DB)
- ✅ Circuit Breaker/Timeout chống treo vô hạn

**🚀 Sẵn sàng cho Production!**
