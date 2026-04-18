# 📋 HƯỚNG DẪN KIỂM THỬ — LEVEL 1 (10 TEST CASES)

> **Dự án:** CAB Booking System  
> **Công cụ test:** Postman / Thunder Client  
> **Gateway URL:** `http://localhost:3000`  
> **Yêu cầu:** Tất cả services đang chạy (`npm run start:all`)

---

## ⚠️ NGUYÊN TẮC BẢO MẬT QUAN TRỌNG

> **KHÔNG BAO GIỜ** truyền `X-User-Id` bằng tay trong Header.  
> Hệ thống sử dụng **JWT Token** (Bearer Token) để xác thực danh tính người dùng.  
> API Gateway sẽ **tự động** giải mã token và định danh bạn là ai.

**Sau khi test TC 2 (Login), hãy copy `accessToken`. Kể từ TC 3 trở đi, luôn mở tab Authorization → Chọn Bearer Token → Dán token vào. Hệ thống sẽ tự động định danh bạn.**

---

## ⚠️ THỨ TỰ CHẠY TEST (CỰC KỲ QUAN TRỌNG)

> [!CAUTION]
> **BẮT BUỘC chạy TC 5 (Driver Online) TRƯỚC khi chạy TC 3 (Book xe).**  
> Nếu không, hệ thống sẽ không tìm thấy tài xế nào ONLINE và booking sẽ chuyển sang trạng thái `SEARCHING` sau 3 giây.

```
TC1 (Register) → TC2 (Login → LƯU TOKEN + USER_ID)
→ TC5 (Driver ONLINE) ← BẮT BUỘC TRƯỚC KHI ĐẶT XE
→ TC3 (Tạo booking với Token) → TC4 (List bookings)
→ TC6 (Verify booking schema) → TC7 (ETA) → TC8 (Pricing)
→ TC9 (Notification) → TC10 (Logout → Invalidate Token)
```

---

## Mục lục  

| TC | Tên Test Case | Endpoint | Auth |
|----|---------------|----------|------|
| 1 | Đăng ký user thành công | `POST /api/auth/register` | ❌ Không cần |
| 2 | Đăng nhập trả JWT hợp lệ | `POST /api/auth/login` | ❌ Không cần |
| 3 | Tạo booking (Status = REQUESTED) | `POST /api/bookings` | ✅ Bearer Token |
| 4 | Lấy danh sách booking của user | `GET /api/bookings?user_id={{2059258d-26a5-436e-b451-82c1b61cc265}}` | ✅ Bearer Token hoặc Query Param |
| 5 | Driver chuyển trạng thái ONLINE | `PUT /api/driver/status` | ❌ Không cần |
| 6 | Tạo booking (Kiểm tra schema đầy đủ) | `POST /api/bookings` | ✅ Bearer Token |
| 7 | API ETA trả giá trị > 0 | `POST /api/eta` | ❌ Không cần |
| 8 | Pricing API trả về giá hợp lệ | `POST /api/pricing/calculate` | ❌ Không cần |
| 9 | Notification gửi thành công | `POST /api/notification/send` | ❌ Không cần |
| 10 | Logout invalidate token | `POST /api/auth/logout` | ✅ Bearer Token |

---

## TC 1: Đăng ký user thành công

### Endpoint
```
POST http://localhost:3000/api/auth/register
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "email": "user@test.com",
  "password": "123456",
  "name": "Test User"
}
```

### Kết quả mong đợi
- **HTTP Status:** `201 Created`
- **Response chứa:**
  - `data.user_id` → UUID của user (**snake_case**)
  - `data.user.id` → Cùng giá trị UUID
  - `data.user.email` → `"user@test.com"`
  - `data.user.name` → `"Test User"`

### ⚠️ HÀNH ĐỘNG SAU TC1
Ghi lại giá trị `user_id` (hoặc `data.user.id`) để dùng cho TC4.

### Ví dụ response
```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "user": {
      "id": "a1b2c3d4-...",
      "email": "user@test.com",
      "role": "CUSTOMER",
      "name": "Test User"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    },
    "user_id": "a1b2c3d4-..."
  }
}
```

---

## TC 2: Đăng nhập trả JWT hợp lệ

### Endpoint
```
POST http://localhost:3000/api/auth/login
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "email": "user@test.com",
  "password": "123456"
}
```

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:**
  - `data.access_token` → JWT hợp lệ (**snake_case**)
  - `data.user_id` → UUID (**snake_case**)
  - `data.tokens.accessToken` → Cùng giá trị JWT

### ⚠️ HÀNH ĐỘNG BẮT BUỘC SAU TC2

1. Trong response, copy giá trị `data.access_token` (hoặc `data.tokens.accessToken`).
2. Copy giá trị `data.user_id` → Dùng cho TC4.
3. **Lưu cả hai lại** — bạn sẽ cần chúng cho TC3, TC4, TC6 và TC10.

### Cách verify JWT
Copy `access_token`, paste vào [jwt.io](https://jwt.io). Payload phải chứa:
```json
{
  "sub": "a1b2c3d4-...",
  "email": "user@test.com",
  "role": "CUSTOMER",
  "exp": 1712934567
}
```

---

## ⚠️ TC 5 PHẢI CHẠY TRƯỚC TC 3 — DRIVER ONLINE

> [!IMPORTANT]
> **Chạy TC5 NGAY sau TC2**, trước khi tạo bất kỳ booking nào.  
> Nếu không có tài xế ONLINE, AI Service sẽ không tìm thấy driver để matching.

## TC 5: Driver chuyển trạng thái ONLINE

### Endpoint
```
PUT http://localhost:3000/api/driver/status
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "driver_id": "DRV001",
  "status": "ONLINE"
}
```

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:**
  - `data.driver_id` → `"DRV001"`
  - `data.status` → `"ONLINE"`
  - `data.updated_at` → Timestamp

---

## TC 3: Tạo booking với Token (Status = REQUESTED)

### Endpoint
```
POST http://localhost:3000/api/bookings
```

### Authorization (Tab trong Postman)
```
Type: Bearer Token
Token: <paste access_token từ TC2 vào đây>
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "pickup": {"lat": 10.76, "lng": 106.66},
  "drop": {"lat": 10.77, "lng": 106.70},
  "distance_km": 5
}
```

### Kết quả mong đợi
- **HTTP Status:** `201 Created`
- **Response chứa:**
  - `data.booking_id` → UUID
  - `data.status` → **`"REQUESTED"`** (BẮT BUỘC)
  - `data.distance_km` → `5`
  - `data.created_at` → Timestamp
  - `data.pickup` → `{"lat": 10.76, "lng": 106.66}`
  - `data.drop` → `{"lat": 10.77, "lng": 106.70}`

### Ví dụ response
```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "booking_id": "f7e8d9c0-...",
    "status": "REQUESTED",
    "pickup": {"lat": 10.76, "lng": 106.66},
    "drop": {"lat": 10.77, "lng": 106.70},
    "distance_km": 5,
    "driver_id": null,
    "created_at": "2026-04-12T..."
  }
}
```

> 💡 Bạn KHÔNG cần truyền `user_id` hay `X-User-Id`! Hệ thống tự biết bạn là ai qua Bearer Token.

---

## TC 4: Lấy danh sách booking của user

### Endpoint (2 cách)

**Cách 1 — Dùng Bearer Token (khuyến nghị):**
```
GET http://localhost:3000/api/bookings
Authorization: Bearer <access_token>
```

**Cách 2 — Dùng query param `user_id` (cho Auto-grader):**
```
GET http://localhost:3000/api/bookings?user_id={{user_id}}
```
> Trong đó `{{user_id}}` là giá trị lấy từ kết quả TC1/TC2 (trường `user_id` hoặc `data.user.id`).

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:** Mảng (list) các booking
- Mỗi item chứa:
  - `booking_id` → UUID
  - `status` → String (e.g., `"REQUESTED"`)

### Ví dụ response
```json
{
  "success": true,
  "statusCode": 200,
  "data": [
    {
      "booking_id": "f7e8d9c0-...",
      "status": "REQUESTED"
    }
  ]
}
```

> 💡 Danh sách sẽ chứa booking vừa tạo ở TC3.

---

## TC 6: Tạo booking (Kiểm tra schema đầy đủ)

> **Giống TC3** — Cùng endpoint, cùng Bearer Token, nhưng kiểm tra kỹ hơn schema output.

### Endpoint
```
POST http://localhost:3000/api/bookings
```

### Authorization
```
Type: Bearer Token
Token: <paste access_token từ TC2 vào đây>
```

### Body (JSON)
```json
  {
    "pickup": {"lat": 10.76, "lng": 106.66},
    "drop": {"lat": 10.77, "lng": 106.70},
    "distance_km": 5
  }
```

### Checklist kiểm tra
- [ ] `booking_id` — có tồn tại, là UUID
- [ ] `status` — chính xác = `"REQUESTED"`
- [ ] `distance_km` — = `5` (echo lại từ input)
- [ ] `created_at` — có tồn tại, là ISO timestamp
- [ ] `pickup.lat` = `10.76` & `pickup.lng` = `106.66` — khớp input
- [ ] `drop.lat` = `10.77` & `drop.lng` = `106.70` — khớp input

---

## TC 7: Gọi API ETA trả về giá trị > 0

### Endpoint
```
POST http://localhost:3000/api/eta
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "distance_km": 5,
  "traffic_level": 0.5
}
```

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:**
  - `eta` → Số > 0 (đơn vị: phút)

### Công thức tính
```
Tốc độ hiệu dụng = 30 × (1 - traffic_level × 0.5) = 22.5 km/h
ETA = (distance_km / tốc_độ) × 60 = (5 / 22.5) × 60 ≈ 13.33 phút
```

---

## TC 8: Pricing API trả về giá hợp lệ

### Endpoint
```
POST http://localhost:3000/api/pricing/calculate
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "distance_km": 5,
  "demand_index": 1.0
}
```

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:**
  - `price` → Số > 0 (VND)
  - `surge` → Số >= 1
  - `base_fare` → `15000`

### Công thức tính
```
surge = max(demand_index, 1.0) = 1.0
price = (base_fare + distance_km × cost_per_km) × surge
      = (15000 + 5 × 10000) × 1.0
      = 65,000 VND
```

---

## TC 9: Notification gửi thành công

### Endpoint
```
POST http://localhost:3000/api/notification/send
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "user_id": "USR123",
  "message": "Your ride is confirmed"
}
```

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:**
  - `sent` → `true`
  - `user_id` → `"USR123"`
  - `message` → `"Your ride is confirmed"`

### Ví dụ response
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "user_id": "USR123",
    "message": "Your ride is confirmed",
    "sent": true,
    "sent_at": "2026-04-12T..."
  }
}
```

---

## TC 10: Logout invalidate token

### Bước 1 — Gọi Logout

### Endpoint
```
POST http://localhost:3000/api/auth/logout
```

### Authorization
```
Type: Bearer Token
Token: <paste access_token vào đây>
```

### Body
```
(Không cần body)
```

### Kết quả mong đợi
- **HTTP Status:** `200 OK`
- **Response chứa:**
  - `data.message` → `"Logged out successfully"`
- **Token đã bị đưa vào Redis Blacklist**

### Bước 2 — Verify token đã bị blacklist
Sau khi logout, thử gọi:
```
GET http://localhost:3000/api/bookings
Authorization: Bearer <token_đã_logout>
```
→ Hệ thống sẽ trả về **`401 Unauthorized`** với message `"Token has been revoked (logged out)"` vì token đã bị vô hiệu hóa trong Redis.

---

## 🤖 Chạy Test Tự Động

Ngoài test thủ công bằng Postman, bạn có thể chạy bộ test tự động:

```bash
node scripts/test_level1.js
```

Kết quả mong đợi:
```
══════════════════════════════════════════════
  LEVEL 1 — 10 TEST CASES (PRODUCTION FLOW)
══════════════════════════════════════════════

  ✅  TC1: Register → user_id=xxxxxxxx, name=Test User
  ✅  TC2: Login → token (sub=xxxxxxxx, exp=...)
  ✅  TC3: Booking → id=xxxxxxxx, status=REQUESTED
  ✅  TC4: List → 1 booking(s), first status=REQUESTED
  ✅  TC5: Driver → DRV001 = ONLINE
  ✅  TC6: Schema check → booking_id=xxxxxxxx, pickup/drop verified
  ✅  TC7: ETA → 13.33 minutes
  ✅  TC8: Pricing → price=65000, surge=1
  ✅  TC9: Notification → sent=true
  ✅  TC10: Logout → "Logged out successfully"

══════════════════════════════════════════════
  RESULT: 10/10 PASSED | 0/10 FAILED
  🏆  ALL 10 TEST CASES PASSED!
══════════════════════════════════════════════
```

---

## 📌 Ghi chú kỹ thuật

| Thành phần | Chi tiết |
|-----------|---------|
| **Xác thực** | JWT Bearer Token — Gateway giải mã, kiểm tra Redis Blacklist, rồi inject `x-user-id` |
| **Response Wrapper** | Tất cả response bọc trong `{ success, statusCode, data, timestamp, path }` |
| **Token Blacklist** | Redis key `token:blacklist:<jwt>` với TTL = thời gian còn lại của token |
| **Naming Convention** | Output dùng **snake_case**: `user_id`, `access_token`, `booking_id`, `distance_km` |
| **Status REQUESTED** | Mọi booking mới đều khởi tạo với status `REQUESTED` — AI matching chạy bất đồng bộ (delay 3s) |
| **ETA Formula** | `ETA (phút) = (distance / (30 × (1 - traffic × 0.5))) × 60` |
| **Pricing Formula** | `price = (15000 + distance × 10000) × max(demand, 1.0)` |

---

> **Tài liệu này được viết cho luồng Production thực tế.**  
> Mọi endpoint đều yêu cầu xác thực đúng chuẩn — KHÔNG có cửa hậu (backdoor).  
> Token đã logout sẽ bị Redis Blacklist chặn NGAY LẬP TỨC tại Gateway.
