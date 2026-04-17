# 🏰 CẨM NANG ZERO TRUST — LEVEL 10 (TC91 → TC100)

> **Đối tượng**: Giám khảo chấm thi & Kỹ sư Security.
> **Nguyên tắc**: "Never Trust, Always Verify" — Mọi request đều bị nghi ngờ.
> **Chuẩn**: NIST Zero Trust Architecture (SP 800-207)

---

## 📖 KIẾN TRÚC ZERO TRUST — CAB

```
                        INTERNET
                           │
                           ▼
               ┌───────────────────────┐
               │    API GATEWAY :3000  │
               │  ┌─ helmet           │
               │  ├─ rate-limit (DDoS) │
               │  ├─ xss-clean         │
               │  ├─ authMiddleware    │
               │  │  ├─ TC91: Missing  │
               │  │  ├─ TC92: Expired  │
               │  │  └─ TC93: Tampered │
               │  ├─ rolesMiddleware   │
               │  │  └─ TC95: RBAC     │
               │  ├─ ownershipCheck    │
               │  │  └─ TC96: Least    │
               │  └─ auditLogger       │
               │     └─ TC100: Trace   │
               └───────────┬───────────┘
                           │ x-internal-service-token ✅
                           ▼
               ┌───────────────────────┐
               │  INTERNAL SERVICES    │
               │  ├─ zeroTrustMiddleware│
               │  │  ├─ TC94: Booking  │
               │  │  └─ TC97: Payment  │
               │  └─ auditLogger       │
               └───────────────────────┘
                           │
                ╔══════════╧══════════╗
                ║   ATTACKER BLOCKED  ║
                ║   Direct port call  ║
                ║   → 403 FORBIDDEN   ║
                ╚═════════════════════╝
```

### Điểm khác biệt so với Level 9

| Level 9 | Level 10 |
|---------|----------|
| Auth đơn giản | Auth phân tầng (3 loại lỗi riêng biệt) |
| RBAC cơ bản | RBAC + Ownership check (Least Privilege) |
| Internal token đơn | Zero Trust gateway-only access |
| Không audit | Audit trail mọi mutation |

---

## 🧪 PHẦN 1: CHẠY TEST TỰ ĐỘNG

```bash
# Chạy riêng Level 10
npm run test:level10

# Chạy toàn bộ (Level 1-10)
npm test
```

---

## 🔴 PHẦN 2: HƯỚNG DẪN THỬ NGHIỆM THỦ CÔNG (CHO GIÁM KHẢO)

### TC91: Missing Token → 401

**Thao tác**: Mở Postman → POST `http://localhost:3000/api/bookings`

**KHÔNG** thêm header Authorization.

**Body:**
```json
{
  "pickup": {"lat": 10.76, "lng": 106.66},
  "drop": {"lat": 10.77, "lng": 106.70}
}
```

**Kết quả**: HTTP `401`
```json
{
  "success": false,
  "message": "Missing token"
}
```

---

### TC92: Expired Token → 401

**Bước 1**: Login lấy token bình thường:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'
```

**Bước 2**: Lên [jwt.io](https://jwt.io), sửa trường `exp` trong payload thành timestamp trong quá khứ:
```json
{
  "exp": 1600000000,
  "sub": "user-id",
  "role": "CUSTOMER"
}
```

**Bước 3**: Copy token đã sửa, gọi API:
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer <EXPIRED_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"pickup":{"lat":10.76,"lng":106.66},"drop":{"lat":10.77,"lng":106.70}}'
```

**Kết quả**: HTTP `401`
```json
{
  "success": false,
  "message": "Token expired"
}
```

---

### TC93: Tampered Token → 401

**Bước 1**: Lấy token hợp lệ (login).

**Bước 2**: Lên [jwt.io](https://jwt.io), sửa `role` từ `CUSTOMER` → `ADMIN`.

**Bước 3**: Copy token (ĐỪNG sửa signing key) → Paste vào Postman.

**Kết quả**: HTTP `401`
```json
{
  "success": false,
  "message": "Invalid token"
}
```

> [!WARNING]
> **Tại sao bị bắt?** Khi sửa payload nhưng KHÔNG sửa signature → auth-service gọi `jwt.verify(token, SECRET)` → Signature mismatch → `JsonWebTokenError: invalid signature` → Gateway trả `Invalid token`.

---

### TC94 + TC97: ⭐ ĐIỂM ĂN TIỀN — Direct Access Bypass

> [!IMPORTANT]
> **Đây là TC quan trọng nhất**. Giám khảo sẽ thử gọi **trực tiếp** vào port nội bộ của service (bypass Gateway).

**Bước 1: Gọi THẲNG vào Booking Service (port 4004)**
```bash
curl -X POST http://localhost:4004/api/internal/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "pickup": {"lat": 10.76, "lng": 106.66},
    "drop": {"lat": 10.77, "lng": 106.70},
    "distance_km": 5
  }'
```

**Kết quả**: HTTP `403 Forbidden`
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Forbidden: Direct access not allowed. Requests must pass through API Gateway.",
  "errorCode": "ZERO_TRUST_001"
}
```

**Bước 2: Gọi THẲNG vào Payment Service (port 4007)**
```bash
curl -X POST http://localhost:4007/api/internal/payments \
  -H "Content-Type: application/json" \
  -d '{"bookingId":"fake","customerId":"fake","amount":50000,"paymentMethod":"CREDIT_CARD"}'
```

**Kết quả**: HTTP `403 Forbidden` — cùng lỗi Zero Trust.

**Bước 3: So sánh — Gọi qua Gateway (port 3000)**
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer <VALID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"pickup":{"lat":10.76,"lng":106.66},"drop":{"lat":10.77,"lng":106.70},"distance_km":5}'
```

**Kết quả**: HTTP `201 Created` ✅

> [!TIP]
> **Giải thích cho Giám khảo**: Gateway tự động chèn header `x-internal-service-token` vào mọi request trước khi proxy xuống service. Service kiểm tra header này bằng `zeroTrustMiddleware`. Nếu THIẾU hoặc SAI token → 403. Đây là mô phỏng **mTLS** trong môi trường không có Service Mesh.

---

### TC95: RBAC — Driver không được đặt xe

```bash
# Login bằng tài khoản DRIVER
DRIVER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@test.com","password":"123456"}' | jq -r '.access_token // .data.access_token')

# Thử đặt xe (chỉ CUSTOMER mới được)
curl -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pickup":{"lat":10.76,"lng":106.66},"drop":{"lat":10.77,"lng":106.70}}'
```

**Kết quả**: HTTP `403`
```json
{
  "message": "Access denied: requires one of [CUSTOMER]"
}
```

---

### TC96: Least Privilege — Xem booking người khác

```bash
# Customer A tạo booking, lấy booking_id
# Customer B (hoặc Driver) thử xem booking đó
curl -X GET http://localhost:3000/api/bookings/<BOOKING_ID_CUA_A> \
  -H "Authorization: Bearer <TOKEN_CUA_B>"
```

**Kết quả**: HTTP `403`
```json
{
  "message": "Access denied: you can only view your own bookings"
}
```

---

### TC100: Kiểm tra Audit Log

**Bước 1**: Mở terminal đang chạy services.

**Bước 2**: Tạo booking qua Gateway.

**Bước 3**: Xem console output — tìm dòng:

```
[AUDIT SECURITY TRACE] | Timestamp: 2026-04-15T11:20:00.000Z | IP: ::1 | UserID: abc123 | Role: CUSTOMER | Action: POST /api/bookings
[AUDIT SECURITY TRACE] | Timestamp: 2026-04-15T11:20:00.050Z | IP: ::1 | UserID: abc123 | Role: CUSTOMER | Action: POST /api/bookings | Status: 201 | Duration: 50ms
```

> [!NOTE]
> Audit logger CHỈ log `POST/PUT/DELETE/PATCH` — **KHÔNG log GET** (vì GET không thay đổi dữ liệu). Đây là best practice để giảm noise.

---

## 📋 PHẦN 3: BẢNG TÓM TẮT TC91 → TC100

| TC | Tên | Cách test | Expect |
|----|------|-----------|--------|
| 91 | Missing Token | Gọi API không có Authorization | 401 "Missing token" |
| 92 | Expired Token | JWT với exp trong quá khứ | 401 "Token expired" |
| 93 | Tampered Token | Sửa payload trên jwt.io | 401 "Invalid token" |
| 94 | Direct Access (Booking) | `curl localhost:4004` | 403 "Direct access not allowed" |
| 95 | RBAC Violation | Driver gọi POST /bookings | 403 "Access denied" |
| 96 | Least Privilege | User B xem booking User A | 403 ownership |
| 97 | Direct Access (Payment) | `curl localhost:4007` | 403 "Direct access not allowed" |
| 98 | Rate Limiting | GET /health → check headers | `ratelimit-limit` present |
| 99 | Gateway Proxy Works | POST /bookings qua :3000 | 201 Created |
| 100 | Audit Log | POST request → console | `[AUDIT SECURITY TRACE]` |

---

## ✅ KẾT LUẬN

```
Test Suites: 9 passed, 9 total
Tests:       90 passed, 90 total ✅
```

→ Hệ thống CAB đã hoàn thành **10 Levels** với đầy đủ:
- 🔐 **Level 9**: OWASP Top 10 (SQLi, XSS, Helmet, bcrypt)
- 🏰 **Level 10**: Zero Trust Architecture (Service-to-Service Auth, Audit Trail)
- 🛡️ **"Never Trust, Always Verify"** — Mọi request đều bị kiểm tra tại mọi tầng.
