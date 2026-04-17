# 🛡️ CẨM NANG SECURITY — LEVEL 9 (TC81 → TC90)

> **Đối tượng**: Kỹ sư Security (Red Team tấn công, Blue Team phòng thủ).
> **Chuẩn**: OWASP Top 10 — 2021.
> **Nguyên tắc**: Tất cả bảo mật là THẬT, không giả lập.

---

## 📖 KIẾN TRÚC BẢO MẬT CHIỀU SÂU

```
┌─────────────────────────────────────────────────┐
│                   INTERNET                      │
└────────────────────┬────────────────────────────┘
                     │
         ┌───────────▼──────────┐
         │   API GATEWAY :3000  │
         │  ┌─ helmet (headers) │
         │  ├─ rate-limit (DDoS)│
         │  ├─ xss-clean (XSS)  │
         │  ├─ cors (CORS)      │
         │  ├─ authMiddleware   │
         │  │  (JWT verify)     │
         │  └─ sanitizer (SQLi) │
         └───────────┬──────────┘
                     │ x-internal-token
         ┌───────────▼───────────────┐
         │   INTERNAL SERVICES       │
         │  ├─ verifyInternalRequest │
         │  ├─ Parameterized Queries │
         │  ├─ bcrypt (password)     │
         │  └─ Data Masking          │
         └───────────────────────────┘
```

| Tầng | Tấn công | Pattern phòng thủ | TC |
|------|----------|--------------------|----|
| Input | SQL Injection | Parameterized Queries (`$1`, `$2`) | 81 |
| Input | XSS | `xss-clean` + HTML tag stripper | 82 |
| Auth | JWT Tampering | `jwt.verify(secret)` — sai chữ ký → 401 | 83 |
| Auth | Missing Token | `authMiddleware` → 401 | 84 |
| Headers | Clickjacking, MIME | `helmet` — security headers | 85 |
| Data | Password Leak | Loại `password_hash` khỏi response | 86 |
| Storage | Plaintext Password | `bcrypt` (salt 12 rounds) | 87 |
| Network | Direct Port Access | `x-internal-token` shared secret | 88 |
| AuthZ | Privilege Escalation | `authorizeRoles('DRIVER')` → 403 | 89 |
| Data | Card Number Leak | Mask `**** **** **** 1234` | 90 |

---

## 🧪 PHẦN 1: CHẠY TEST TỰ ĐỘNG

```bash
# Chạy riêng Level 9
npm run test:level9

# Chạy toàn bộ (Level 1-9)
npm test
```

---

## 🔴 PHẦN 2: RED TEAM — HƯỚNG DẪN TẤN CÔNG

### TC81: SQL Injection

**Mục tiêu**: Bypass login bằng SQLi.

**Bước 1**: Mở Postman → `POST http://localhost:3000/api/auth/login`

**Bước 2**: Body JSON:
```json
{
  "email": "admin' OR 1=1;--",
  "password": "anything"
}
```

**Bước 3**: Thử thêm payload nguy hiểm:
```json
{
  "email": "'; DROP TABLE users;--",
  "password": "anything"
}
```

**Kết quả mong đợi**: HTTP `401` — "Invalid credentials"

> [!IMPORTANT]
> **Tại sao an toàn?** Auth service dùng **Parameterized Query**:
> ```javascript
> pool.query('SELECT * FROM users WHERE email = $1', [email])
> ```
> PostgreSQL driver tự escape `$1` → payload `' OR 1=1;--` chỉ là string bình thường, KHÔNG phải câu lệnh SQL.

---

### TC82: Cross-Site Scripting (XSS)

**Mục tiêu**: Inject mã JavaScript vào database.

**Bước 1**: Mở Postman → `POST http://localhost:3000/api/auth/register`

**Bước 2**: Body JSON:
```json
{
  "email": "hacker@evil.com",
  "password": "Hack123!",
  "name": "<script>alert('XSS')</script>Evil User"
}
```

**Bước 3**: Login và kiểm tra response:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"hacker@evil.com","password":"Hack123!"}'
```

**Kết quả mong đợi**: Tên user đã bị sanitize:
```json
{
  "name": "Evil User"    ← <script> đã bị xóa!
}
```

> [!TIP]
> **2 tầng bảo vệ**: 
> 1. `xss-clean` middleware: biến `<script>` → `&lt;script&gt;`
> 2. Custom sanitizer: strip toàn bộ HTML tags → chỉ còn text

---

### TC83: JWT Tampering (Giả mạo Token)

**Mục tiêu**: Sửa role trong JWT để leo quyền ADMIN.

**Bước 1**: Login lấy token:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'
```

**Bước 2**: Copy token, lên [jwt.io](https://jwt.io) → Dán vào "Encoded"

**Bước 3**: Trong phần "Decoded" → sửa Payload:
```json
{
  "sub": "user-id-here",
  "email": "test@test.com",
  "role": "ADMIN"        ← SỬA TỪ "CUSTOMER"
}
```

**Bước 4**: Copy token đã sửa (phần Encoded), dán vào Postman:
```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.TAMPERED.SIGNATURE" \
  -d '{"pickup":{"lat":10.76,"lng":106.66},"drop":{"lat":10.77,"lng":106.70}}'
```

**Kết quả mong đợi**: HTTP `401 Unauthorized`

> [!WARNING]
> **Tại sao bị bắt?** Gateway gọi `auth-service/validate-token`. Auth service dùng `jwt.verify(token, SECRET_KEY)`. Khi payload bị sửa nhưng signature giữ nguyên → **chữ ký không khớp** → `JsonWebTokenError: invalid signature` → 401.

---

### TC89: RBAC — Tấn công leo quyền

**Mục tiêu**: Dùng token Customer gọi API dành riêng cho Driver.

**Bước 1**: Login với tài khoản Customer:
```bash
CUSTOMER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@test.com","password":"123456"}' | jq -r '.access_token // .data.access_token')
```

**Bước 2**: Thử gọi API cập nhật vị trí driver:
```bash
curl -X PUT http://localhost:3000/api/driver/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -d '{"driver_id":"fake-driver","status":"AVAILABLE"}'
```

**Kết quả mong đợi (khi RBAC áp dụng)**: HTTP `403 Forbidden`
```json
{
  "success": false,
  "message": "Forbidden: requires role [DRIVER], your role is [CUSTOMER]"
}
```

> [!NOTE]
> Middleware `authorizeRoles('DRIVER')` kiểm tra `req.user.role` từ JWT. Customer có role `CUSTOMER` → không match → 403.

---

### TC88: Truy cập trực tiếp Service Port

**Mục tiêu**: Bypass Gateway, gọi thẳng vào Booking Service.

```bash
# Gọi trực tiếp port 4004 (Booking Service) — KHÔNG qua Gateway
curl -X POST http://localhost:4004/api/internal/bookings \
  -H "Content-Type: application/json" \
  -d '{"pickup":{"lat":10.76,"lng":106.66},"drop":{"lat":10.77,"lng":106.70}}'
```

**Kết quả mong đợi (khi verifyInternalRequest áp dụng)**: HTTP `403 Forbidden`
```json
{
  "success": false,
  "message": "Forbidden: internal-only endpoint. Missing or invalid x-internal-token."
}
```

**Gọi đúng cách (từ Gateway)**:
```bash
# Gateway tự động đính kèm x-internal-token
curl -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer $TOKEN" \
  -d '...'
# → 201 Created ✅
```

---

## 🔵 PHẦN 3: BLUE TEAM — CẤU HÌNH BẢO VỆ

### Helmet — Security Headers
```javascript
// api-gateway/app.js
app.use(helmet({
  contentSecurityPolicy: false,  // API-only, không có HTML
  crossOriginEmbedderPolicy: false,
}));
```

**Headers được thiết lập:**
| Header | Giá trị | Chống |
|--------|---------|-------|
| `X-Content-Type-Options` | `nosniff` | MIME Sniffing |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking |
| `X-DNS-Prefetch-Control` | `off` | DNS Prefetch |
| `X-Powered-By` | **Removed** | Technology Disclosure |
| `Strict-Transport-Security` | `max-age=...` | Downgrade Attack |

### Parameterized Queries (Tất cả services)
```javascript
// ✅ AN TOÀN — Parameterized
pool.query('SELECT * FROM users WHERE email = $1', [email]);

// ❌ NGUY HIỂM — String concatenation (KHÔNG CÓ trong codebase)
pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### bcrypt Password Hashing
```javascript
// Register: hash trước khi lưu
const salt = await bcrypt.genSalt(12);
const passwordHash = await bcrypt.hash(password, salt);

// Login: compare hash
const valid = await bcrypt.compare(password, user.passwordHash);
```

---

## 📋 PHẦN 4: BẢNG TÓM TẮT TC81 → TC90

| TC | Tên | Tấn công | Expect |
|----|------|----------|--------|
| 81 | SQL Injection | `' OR 1=1;--` trong email | 401, no data leak |
| 82 | XSS | `<script>alert('XSS')</script>` | Tags stripped |
| 83 | JWT Tamper | Sửa role trên jwt.io | 401 Unauthorized |
| 84 | Missing Token | Gọi API không có Bearer | 401 |
| 85 | Security Headers | `GET /api/health` | `x-content-type-options: nosniff` |
| 86 | Password Masking | Register/Login response | No password/hash visible |
| 87 | bcrypt | Correct pw=200, wrong=401 | Hash verification works |
| 88 | Internal Token | Direct port call without token | 403 |
| 89 | RBAC | Customer → driver endpoint | 403 Forbidden |
| 90 | Data Masking | Booking + Payment response | No secrets leaked |

---

## ✅ QUY TRÌNH KIỂM TRA ĐẦY ĐỦ

```bash
# 1. Khởi động
docker-compose up -d
npm run start:all

# 2. Chạy Security Tests
npm run test:level9

# 3. Red Team Manual
# Mở Postman → thử các payload ở PHẦN 2

# 4. Verify headers
curl -I http://localhost:3000/api/health
# Xem: x-content-type-options: nosniff
# Xem: KHÔNG CÓ x-powered-by

# 5. Chạy toàn bộ Level 1-9
npm test
```

> Nếu tất cả pass → **Level 9 Security Hardening hoàn thành** 🎉
