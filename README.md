<p align="center">
  <img src="https://img.shields.io/badge/Architecture-Microservices-blue" />
  <img src="https://img.shields.io/badge/Security-Zero%20Trust-critical" />
  <img src="https://img.shields.io/badge/Transactions-Saga%20%2B%20Outbox-orange" />
  <img src="https://img.shields.io/badge/Resilience-Circuit%20Breaker-green" />
  <img src="https://img.shields.io/badge/Tests-90%20Passed-brightgreen" />
</p>

# CAB — Ride-Hailing Microservices Platform

**Nền tảng đặt xe theo kiến trúc Microservices hướng sự kiện, tích hợp bảo mật Zero Trust và cơ chế chịu lỗi cấp Enterprise.**

---

## 1. Tầm nhìn Kiến trúc (Architectural Vision)

Hệ thống CAB được thiết kế theo kiến trúc **Event-Driven Microservices** nhằm giải quyết ba hạn chế cốt lõi của kiến trúc nguyên khối (Monolithic Architecture):

| Hạn chế Monolithic | Giải pháp Microservices trong CAB |
|---|---|
| **Lỗi lan truyền (Cascading Failure)** — Một module lỗi có thể kéo sập toàn bộ hệ thống. | **Cô lập lỗi (Fault Isolation)** — Mỗi service chạy trong process riêng biệt. Payment Service lỗi không ảnh hưởng Booking Service. Circuit Breaker (Opossum) tự động ngắt kết nối đến service lỗi. |
| **Không thể mở rộng từng phần (Scaling Bottleneck)** — Phải scale toàn bộ ứng dụng dù chỉ một module quá tải. | **Mở rộng độc lập (Independent Scaling)** — Có thể tăng instance Booking Service vào giờ cao điểm mà không cần scale Auth hay Review Service. |
| **Triển khai nguyên khối (Risky Deployment)** — Mỗi lần deploy lại toàn bộ ứng dụng, tăng rủi ro regression. | **Triển khai linh hoạt (Independent Deployment)** — Cập nhật Pricing logic mà không cần restart Gateway hay Booking Service. |

Giao tiếp giữa các service dựa trên hai mô hình bổ sung: **Synchronous** (HTTP/REST qua API Gateway) cho các thao tác cần phản hồi tức thì (đăng nhập, tạo booking), và **Asynchronous** (Apache Kafka) cho các luồng xử lý nền không cần chờ đợi (thông báo, cập nhật trạng thái, thanh toán).

---

## 2. Kiến trúc Hệ thống (System Architecture)

```
                                  ┌────────────────────────┐
                                  │   Client Application   │
                                  │   (React SPA / Mobile) │
                                  └───────────┬────────────┘
                                              │ HTTPS
                                              ▼
                       ╔═══════════════════════════════════════════╗
                       ║          API GATEWAY  (:3000)             ║
                       ║  ┌─────────────────────────────────────┐  ║
                       ║  │ Helmet → Rate Limiter → CORS →      │  ║
                       ║  │ XSS Sanitizer → Audit Logger →      │  ║
                       ║  │ JWT Auth → RBAC → Response Wrapper  │  ║
                       ║  └─────────────────────────────────────┘  ║
                       ║  Internal Token Injection ────────────►   ║
                       ╚════╤════╤════╤════╤════╤════╤════╤════════╝
                            │    │    │    │    │    │    │
          ┌─────────────────┼────┼────┼────┼────┼────┼────┼──────────────┐
          │                 │    │    │    │    │    │    │               │
          │  ┌──────────┐ ┌┴─────┴┐ ┌┴────┴┐ ┌┴────┴┐ ┌┴──────────┐   │
          │  │   Auth   │ │ User  │ │Driver│ │Booking│ │   Ride    │   │
          │  │  :4001   │ │ :4002 │ │:4003 │ │ :4004 │ │  :4005    │   │
          │  └──────────┘ └───────┘ └──────┘ └───────┘ └───────────┘   │
          │  ┌──────────┐ ┌───────┐ ┌──────┐ ┌───────┐                 │
          │  │ Pricing  │ │Payment│ │Notif │ │  AI   │                 │
          │  │  :4006   │ │ :4007 │ │:4008 │ │ :4010 │                 │
          │  └──────────┘ └───────┘ └──────┘ └───────┘                 │
          │  ┌──────────┐       Zero Trust Perimeter                   │
          │  │ Review   │       (x-internal-service-token required)    │
          │  │  :3008   │                                              │
          │  └──────────┘                                              │
          └────────────────────────────────────────────────────────────┘
                       │                          │
          ┌────────────▼──────────┐   ┌───────────▼──────────┐
          │    Apache Kafka       │   │       Redis           │
          │    (Event Bus)        │   │  (Cache / Pub-Sub /   │
          │    9 Event Topics     │   │   Token Blacklist)    │
          └───────────────────────┘   └──────────────────────┘
          ┌───────────────────────┐   ┌──────────────────────┐
          │   PostgreSQL 16       │   │     MongoDB 7        │
          │   (6 Databases)       │   │  (Review Database)   │
          └───────────────────────┘   └──────────────────────┘
```

### 2.1. Vai trò các thành phần hệ thống

#### API Gateway (`:3000`)

Đóng vai trò **Single Point of Entry** — toàn bộ traffic từ client bắt buộc đi qua Gateway trước khi đến các internal service. Đây là điểm thực thi tập trung cho:

- **Edge Security**: Rate Limiting (200 req/phút/IP qua `express-rate-limit`), HTTP Security Headers (`helmet`), Input Sanitization (`xss-clean` + bộ lọc SQLi tự viết), CORS Policy.
- **Authentication & Authorization**: Xác thực JWT bằng cách gọi Auth Service qua HTTP, sau đó kiểm tra RBAC (phân quyền theo role `CUSTOMER` / `DRIVER` / `ADMIN`) trước khi cho phép request đi tiếp.
- **Reverse Proxy**: Định tuyến request đến đúng internal service dựa trên path (`/api/bookings` → Booking Service `:4004`, `/api/auth` → Auth Service `:4001`).
- **Internal Token Injection**: Trước khi chuyển tiếp request, Gateway tự động gắn header `x-internal-service-token` — đây là cơ chế để internal service phân biệt request hợp lệ (qua Gateway) với request trái phép (gọi thẳng port).

#### Apache Kafka — Event-Driven Backbone

Kafka đóng vai trò **Message Broker** trung tâm cho toàn bộ giao tiếp bất đồng bộ giữa các service. Mục đích kỹ thuật:

- **Decoupling**: Booking Service không cần biết sự tồn tại của Notification Service. Nó chỉ publish event `ride.created` lên Kafka topic; bất kỳ service nào quan tâm sẽ tự subscribe và xử lý. Điều này cho phép thêm/bớt consumer mà không sửa code producer.
- **Saga Choreography**: Kafka là hạ tầng nền để triển khai Saga Pattern — chuỗi event `ride.created → ride.assigned → ride.priced → payment.completed` tạo thành một transaction phân tán xuyên suốt nhiều service và database, mà không cần distributed lock.
- **Buffering & Resilience**: Khi downstream service tạm thời không khả dụng, message được lưu trữ trong Kafka partition và sẽ được xử lý khi service hồi phục — đảm bảo không mất dữ liệu (at-least-once delivery).

Hệ thống sử dụng 9 Kafka topic, tổ chức theo domain:

| Topic | Producer | Consumer | Mục đích |
|---|---|---|---|
| `ride.created` | Booking Service | Ride, AI Service | Kích hoạt luồng tìm tài xế |
| `ride.assigned` | Ride Service | Booking, Driver, Notification | Thông báo tài xế được chọn |
| `ride.matching.failed` | Ride Service | Booking, Notification | Rollback khi không tìm được tài xế |
| `ride.status.updated` | Ride Service | Pricing Service | Trigger tính giá khi trạng thái thay đổi |
| `ride.priced` | Pricing Service | Notification | Thông báo giá cho khách |
| `payment.completed` | Payment Service | Notification | Xác nhận thanh toán thành công |
| `payment.failed` | Payment Service | Booking Service | **Saga Compensation** — tự động hủy booking |
| `user.registered` | Auth Service | User, Driver Service | Đồng bộ profile khi đăng ký mới |

#### Redis — In-Memory Data Store

Redis phục vụ ba mục đích tách biệt trong hệ thống:

- **Token Blacklist**: Khi user logout, JWT token được lưu vào Redis với TTL bằng thời gian còn lại của token. Mọi request tiếp theo mang token này sẽ bị từ chối tại Gateway — giải quyết vấn đề "JWT is stateless but logout requires state".
- **Real-time Pub/Sub**: Kafka consumer (Notification Service) publish thông báo lên Redis channel `notifications`; Gateway subscribe channel này và đẩy xuống client qua WebSocket (Socket.IO). Redis Pub/Sub được chọn thay vì Kafka direct vì latency thấp hơn (~1ms vs ~50ms) cho real-time push.
- **Rate Limiting Store**: `express-rate-limit` sử dụng Redis làm backing store để đếm request per IP — đảm bảo rate limit nhất quán ngay cả khi Gateway chạy nhiều instance.

#### PostgreSQL & MongoDB — Database-per-Service

Hệ thống tuân thủ nguyên tắc **Database-per-Service** — mỗi service sở hữu database riêng biệt, không service nào được phép truy vấn trực tiếp database của service khác:

| Service | Database | Engine | Lý do chọn Engine |
|---|---|---|---|
| Auth Service | `cab_auth_db` | PostgreSQL | Dữ liệu credential cần ACID transaction nghiêm ngặt |
| User Service | `cab_user_db` | PostgreSQL | Profile data có schema cố định, cần JOIN hiệu quả |
| Driver Service | `cab_driver_db` | PostgreSQL | Tương tự User Service |
| Booking Service | `cab_booking_db` | PostgreSQL | Cần transaction (BEGIN/COMMIT/ROLLBACK) cho Outbox Pattern |
| Pricing Service | `cab_pricing_db` | PostgreSQL | Fare table có cấu trúc cố định |
| Payment Service | `cab_payment_db` | PostgreSQL | Dữ liệu tài chính cần ACID đảm bảo tuyệt đối |
| Review Service | `cab_review_db` | MongoDB | Dữ liệu đánh giá có cấu trúc linh hoạt (text dài, nested rating), phù hợp với document model. Aggregation pipeline tính trung bình sao hiệu quả hơn SQL GROUP BY trên dataset lớn. |

Nguyên tắc này đảm bảo **Loose Coupling** ở tầng data: thay đổi schema của Booking database không gây ảnh hưởng đến Payment hay Notification Service.

---

## 3. Điểm nhấn Kỹ thuật Chuyên sâu (Key Enterprise Patterns)

### 3.1. Distributed Transactions — Saga Pattern & Outbox Pattern

**Vấn đề**: Trong kiến trúc microservices, một thao tác nghiệp vụ (đặt xe) liên quan đến nhiều database khác nhau (Booking DB, Payment DB, Pricing DB). Không thể dùng database transaction truyền thống (`BEGIN ... COMMIT`) vì các database nằm trên các service riêng biệt.

**Giải pháp — Saga Choreography**: Hệ thống sử dụng chuỗi event trên Kafka để phối hợp các bước. Mỗi service lắng nghe event trước đó, thực hiện logic cục bộ, rồi phát event tiếp theo:

```
  Booking Service              Kafka                AI / Ride Service
       │                         │                         │
       │  ① INSERT booking       │                         │
       │  ② INSERT outbox_event  │                         │
       │  ③ COMMIT (atomic)      │                         │
       │ ───── ride.created ────►│                         │
       │                         │ ──── ride.created ─────►│
       │                         │                         │  ④ Tìm tài xế
       │                         │◄──── ride.assigned ─────│
       │◄── ride.assigned ───────│                         │
       │  ⑤ UPDATE status=       │                         │
       │     ASSIGNED             │                         │
       │                         │                         │
       │       ─── FAILURE PATH (Compensation) ───         │
       │                         │                         │
       │                         │◄── payment.failed ──────│ Payment Service
       │◄── payment.failed ──────│                         │
       │  ⑥ UPDATE status=       │                         │
       │     CANCELLED            │                         │
       │  (Terminal State Guard)  │                         │
```

**Tại sao cần Outbox Pattern**: Nếu Booking Service thực hiện `INSERT booking` rồi `publish Kafka event` trong hai bước riêng biệt, có rủi ro: booking được tạo thành công nhưng event không được gửi (crash giữa chừng, Kafka tạm thời down). Kết quả: booking "treo" vĩnh viễn, không ai biết để xử lý tiếp.

Outbox Pattern giải quyết bằng cách ghi booking lẫn event vào cùng một database transaction:

```sql
BEGIN;
  INSERT INTO bookings (...) VALUES (...);         -- Bước 1: Tạo booking
  INSERT INTO outbox_events (topic, payload) ...;  -- Bước 2: Ghi event vào outbox table
COMMIT;
```

Sau đó, một **background worker** (`outboxPublisher.js`) polling table `outbox_events` mỗi 2 giây, publish lên Kafka, rồi đánh dấu `processed = true`. Nếu Kafka down, event giữ nguyên `processed = false` và sẽ được retry ở chu kỳ tiếp theo — đảm bảo **at-least-once delivery** mà không mất message.

Các cơ chế bảo vệ bổ sung:
- **Idempotency Key** (header `Idempotency-Key`): Nếu client gửi lại cùng một request (do network retry), hệ thống nhận diện key trùng và trả về booking đã tạo thay vì tạo bản mới — tránh duplicate booking.
- **Pessimistic Locking** (`SELECT ... FOR UPDATE`): Đảm bảo chỉ một transaction được phép cập nhật cùng một booking tại một thời điểm — chống race condition khi nhiều Kafka consumer xử lý song song.
- **Terminal State Guard**: Booking ở trạng thái `CANCELLED` hoặc `COMPLETED` sẽ từ chối mọi cập nhật tiếp theo — ngăn Kafka consumer cũ (delayed message) ghi đè trạng thái cuối.

### 3.2. Zero Trust Architecture — "Never Trust, Always Verify"

**Vấn đề**: Trong kiến trúc microservices, các service giao tiếp qua mạng nội bộ (internal network). Nếu chỉ bảo vệ Gateway (perimeter security), attacker xâm nhập được vào mạng nội bộ có thể gọi thẳng `http://booking-service:4004` mà bỏ qua hoàn toàn xác thực và phân quyền.

**Giải pháp — Defense in Depth**: Hệ thống triển khai bảo mật theo 10 lớp, mỗi lớp hoạt động độc lập — nếu một lớp bị bypass, các lớp tiếp theo vẫn bảo vệ hệ thống:

```
  L1   Helmet              HTTP Security Headers (X-Frame-Options, HSTS, ...)
  L2   Rate Limiter         200 req/phút/IP — chống brute-force, DDoS
  L3   Input Sanitization   xss-clean + custom SQLi filter — chống injection
  L4   JWT Authentication    3 trạng thái lỗi tách biệt:
                               • Missing token  → 401
                               • Token expired  → 401 
                               • Token tampered → 401
  L5   RBAC Authorization   Factory middleware authorizeRoles('CUSTOMER')
                            — chỉ role được phép mới truy cập resource
  L6   Ownership Check      GET /bookings/:id kiểm tra customer_id khớp
                            với user đang đăng nhập — Least Privilege
  L7   Internal Token       Gateway gắn x-internal-service-token vào mọi
                            outbound request; internal service reject nếu
                            token thiếu hoặc sai — chặn direct port access
  L8   Parameterized SQL    Toàn bộ query dùng $1, $2 (prepared statement)
                            — TUYỆT ĐỐI không nối chuỗi string
  L9   Data Masking         API response KHÔNG BAO GIỜ trả password hash,
                            internal ID, hay thông tin nhạy cảm
  L10  Audit Trail          Mọi mutation (POST/PUT/DELETE) được ghi log
                            dạng [AUDIT SECURITY TRACE] kèm timestamp,
                            IP, UserID, Role, Action, HTTP Status
```

Cơ chế **Internal Service Token** hoạt động như sau:

1. Gateway inject header `x-internal-service-token = <shared_secret>` vào mọi request trước khi forward đến internal service.
2. Mỗi internal service mount `zeroTrustMiddleware` — middleware này kiểm tra header trên và chỉ cho phép request đi tiếp nếu token khớp.
3. Request gọi thẳng vào port internal service (bỏ qua Gateway) sẽ không có header này → bị reject với HTTP 403.

Đây là dạng triển khai đơn giản hóa của **mTLS (mutual TLS)** — thay vì certificate, hệ thống dùng shared secret qua header. Trong môi trường production thực tế, cơ chế này nên được thay bằng mTLS certificate hoặc service mesh (Istio/Linkerd).

### 3.3. Circuit Breaker — Ngăn chặn Cascading Failure

**Vấn đề**: Khi AI Service hoặc Pricing Service bị quá tải hoặc ngừng hoạt động, Booking Service vẫn tiếp tục gửi request đến đó. Mỗi request bị timeout (3 giây), thread bị block, connection pool cạn kiệt, và cuối cùng Booking Service cũng ngừng phản hồi — đây là hiện tượng **cascading failure** (lỗi lan truyền dây chuyền).

**Giải pháp — Circuit Breaker Pattern (Opossum)**: Mỗi kết nối đến external service được bọc trong một Circuit Breaker hoạt động theo 3 trạng thái:

```
  CLOSED ────── (>50% request thất bại trong 10s) ──────► OPEN
     ▲                                                      │
     │                                                      │ Mọi request bị reject
     │                                                      │ ngay lập tức → Fallback
     │                                                      │ (không chờ timeout)
     │                                                      ▼
     └──────── (request thử nghiệm thành công) ◄──── HALF-OPEN
                                                     (sau 10s, cho 1 request thử)
```

| Cấu hình | Giá trị | Ý nghĩa |
|---|---|---|
| `timeout` | 3000ms | Request vượt 3s → tính là failure |
| `errorThresholdPercentage` | 50% | Circuit mở khi ≥50% request thất bại |
| `resetTimeout` | 10000ms | Sau 10s, thử 1 request (HALF-OPEN) |
| `volumeThreshold` | 5 | Cần ít nhất 5 request trước khi đánh giá tỷ lệ lỗi |

**Graceful Degradation**: Khi circuit ở trạng thái OPEN, hệ thống không trả lỗi 500 cho client mà cung cấp **giá trị fallback** tính bằng logic quy tắc đơn giản:

- AI/ETA Service down → Fallback ETA = 10 phút (giá trị mặc định an toàn)
- Pricing Service down → Fallback Price = 15,000 VNĐ × `distance_km` (đơn giá cơ bản, surge = 1.0)

Client nhận response bình thường (HTTP 201) kèm flag `fallback_triggered: true` để biết dữ liệu là ước tính, không phải tính toán chính xác.

Bổ trợ Circuit Breaker, hệ thống sử dụng **Exponential Backoff** (thư viện `axios-retry`): trước khi mở circuit, mỗi request thất bại được retry 3 lần với delay tăng dần (100ms → 200ms → 400ms), tránh việc mở circuit quá sớm do lỗi tạm thời (transient error).

### 3.4. AI Orchestration — Composite Driver Scoring

**Vấn đề**: Việc chọn tài xế ngẫu nhiên hoặc chỉ dựa vào khoảng cách dẫn đến chất lượng dịch vụ không đồng đều — tài xế gần nhất có thể có rating thấp hoặc đưa giá cao.

**Giải pháp — Multi-Variable Composite Scoring**: AI Agent tính điểm tổng hợp cho mỗi tài xế dựa trên 3 biến đầu vào, mỗi biến được chuẩn hóa (normalize) về khoảng tương đương trước khi kết hợp:

```
  Score = W₁ × NormDistance + W₂ × NormRating + W₃ × NormPrice

  Trong đó:
    NormDistance = 1 / (distance_km + 0.1)    → Gần hơn = điểm cao hơn
    NormRating  = rating / 5.0                → Rating cao = điểm cao
    NormPrice   = 1 / (price/10000 + 1)       → Giá thấp = điểm cao

    W₁ = 0.40  (Khoảng cách — ưu tiên cao nhất)
    W₂ = 0.35  (Rating — ưu tiên cao)
    W₃ = 0.25  (Giá cước — ưu tiên phụ)
```

Pipeline xử lý tuần tự:

1. **Filter**: Loại bỏ tài xế có status ≠ `ONLINE`
2. **ETA Calculation**: Tính thời gian đến cho từng tài xế: `ETA = (distance / speed) × 60 × (1 + traffic_level)`
3. **Pricing**: Tính giá cước dựa trên khoảng cách và hệ số surge (theo mức giao thông)
4. **Scoring**: Áp dụng công thức Composite Score cho mỗi tài xế
5. **Selection**: Chọn tài xế có điểm cao nhất
6. **Decision Log**: Ghi log `[AGENT DECISION] Selected Driver X. Reason: Best composite score (0.95). ETA: 2min, Distance: 0.5km.`

Toàn bộ tính toán là **stateless** — mọi biến được scope trong function call, không có shared mutable state — đảm bảo an toàn khi xử lý 10+ request đồng thời mà không xảy ra data corruption.

**Fallback**: Khi Agent gặp lỗi runtime (exception), hệ thống tự động chuyển sang rule-based: chọn tài xế ONLINE gần nhất (sort by distance ascending).

---

## 4. Công nghệ Sử dụng (Technology Stack)

### Backend & Runtime

| Công nghệ | Phiên bản | Vai trò trong hệ thống |
|---|---|---|
| **Node.js** | 22 LTS | Runtime cho toàn bộ 10 microservices. Được chọn vì non-blocking I/O phù hợp với workload I/O-bound (HTTP proxy, database query, Kafka produce/consume). |
| **Express** | 4.x | HTTP framework. Middleware chain cho phép xếp chồng các lớp bảo mật (helmet → rate limit → auth → RBAC) theo thứ tự xử lý rõ ràng. |
| **KafkaJS** | 2.x | Kafka client cho Node.js. Quản lý Consumer Group, offset commit, và reconnect tự động khi broker tạm mất kết nối. |
| **Opossum** | 8.x | Circuit Breaker implementation. Bọc các lời gọi HTTP đến external service, tự động ngắt mạch khi tỷ lệ lỗi vượt ngưỡng. |
| **axios-retry** | 4.x | Exponential backoff cho HTTP client. Retry 3 lần (100ms → 200ms → 400ms) trước khi Circuit Breaker mở. |
| **Socket.IO** | 4.x | WebSocket abstraction cho real-time push notification. Hỗ trợ fallback sang long-polling nếu WebSocket bị chặn bởi proxy. |

### Security

| Công nghệ | Vai trò trong hệ thống |
|---|---|
| **jsonwebtoken** | Phát hành và xác thực JWT Access Token (15 phút) và Refresh Token (7 ngày). |
| **bcrypt** (salt round: 12) | Hash password. Salt round 12 đảm bảo thời gian hash ~250ms — đủ chậm để chống brute-force nhưng không gây ảnh hưởng đáng kể đến UX. |
| **helmet** | Thiết lập HTTP Security Headers tự động: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, v.v. |
| **xss-clean** | Sanitize toàn bộ `req.body`, `req.query`, `req.params` — loại bỏ HTML/script tags trước khi xử lý. |
| **express-rate-limit** | Rate limiting tại Gateway: 200 request/phút/IP. Sử dụng Redis store để đếm nhất quán trong multi-instance deployment. |

### Database & Infrastructure

| Công nghệ | Phiên bản | Vai trò trong hệ thống |
|---|---|---|
| **PostgreSQL** | 16 Alpine | RDBMS chính cho 6 database (Auth, User, Driver, Booking, Pricing, Payment). Hỗ trợ ACID transaction, `SELECT ... FOR UPDATE` locking, và multi-database trong cùng 1 instance qua init script. |
| **MongoDB** | 7 | Document store cho Review Service. Schema linh hoạt phù hợp dữ liệu đánh giá (text review có độ dài biến thiên, nested rating structure). |
| **Redis** | 7 Alpine | In-memory store phục vụ 3 mục đích: Token Blacklist (TTL-based), Rate Limiting counter, và Pub/Sub channel cho real-time notification. |
| **Apache Kafka** | 7.6 (Confluent) | Distributed event streaming. 9 topic, at-least-once delivery. Dùng Zookeeper 7.6 cho cluster coordination. |

### DevOps & Monitoring

| Công nghệ | Vai trò trong hệ thống |
|---|---|
| **Docker Compose** | Orchestrate 7 infrastructure containers (PostgreSQL, Redis, Kafka, Zookeeper, MongoDB, Prometheus, Grafana) với health check và dependency ordering. |
| **GitHub Actions** | CI pipeline: chạy toàn bộ 90 test case trên mỗi push/PR. Sử dụng Docker Compose service containers cho integration testing. |
| **Prometheus** | Thu thập metrics từ Gateway (`/metrics` endpoint): request count, response time histogram, error rate — theo chuẩn OpenMetrics. |
| **Grafana** | Dashboard visualization cho Prometheus metrics. Pre-configured datasource qua provisioning file. |

### Testing

| Công nghệ | Vai trò trong hệ thống |
|---|---|
| **Jest** 30 | Test runner. Chạy 9 test suite tuần tự (`--runInBand`) để tránh race condition giữa các test thao tác cùng database. |
| **Supertest** 7 | HTTP assertion library. Gửi request thật đến Gateway đang chạy (integration test), không mock — đảm bảo kiểm tra luồng end-to-end. |

---

## 5. Danh mục Microservices

| # | Service | Port | Database | Trách nhiệm chính |
|---|---------|------|----------|-------------------|
| 1 | **API Gateway** | 3000 | — | Single entry point. Edge security, JWT auth, RBAC, reverse proxy, internal token injection, audit logging. |
| 2 | **Auth Service** | 4001 | `cab_auth_db` (PG) | Đăng ký/đăng nhập, phát hành JWT (access + refresh), validate token, logout (Redis blacklist). |
| 3 | **User Service** | 4002 | `cab_user_db` (PG) | CRUD profile khách hàng. Kafka consumer nhận event `user.registered` để đồng bộ dữ liệu. |
| 4 | **Driver Service** | 4003 | `cab_driver_db` (PG) | CRUD profile tài xế, quản lý trạng thái ONLINE/OFFLINE. Consumer event `ride.assigned`. |
| 5 | **Booking Service** | 4004 | `cab_booking_db` (PG) | Saga orchestrator. Transactional create (Outbox Pattern), state machine (REQUESTED → ASSIGNED → ... → COMPLETED), idempotency key, pessimistic locking. |
| 6 | **Ride Service** | 4005 | — | GPS-based driver matching via Redis GEO. Consumer `ride.created`, producer `ride.assigned` / `ride.matching.failed`. |
| 7 | **Pricing Service** | 4006 | `cab_pricing_db` (PG) | Dynamic pricing: base fare × surge multiplier (dựa trên traffic level). Consumer event `ride.status.updated`. |
| 8 | **Payment Service** | 4007 | `cab_payment_db` (PG) | Xử lý thanh toán. Idempotent operation. Producer event `payment.completed` / `payment.failed` (trigger Saga compensation). |
| 9 | **Notification Service** | 4008 | — | Multi-topic Kafka consumer. Publish thông báo qua Redis Pub/Sub → Gateway WebSocket → Client real-time. |
| 10 | **AI Service** | 4010 | — | Composite scoring (driver matching), ETA estimation, dynamic pricing calculation, fraud detection (heuristic-based), demand forecast. |
| 11 | **Review Service** | 3008 | `cab_review_db` (Mongo) | CRUD đánh giá tài xế (star rating + text comment). Aggregation pipeline cho thống kê trung bình sao. |

---

## 6. Hướng dẫn Triển khai (Quick Start)

### Yêu cầu hệ thống

- **Node.js** ≥ 22.x
- **Docker Desktop** (bao gồm Docker Compose v2)
- **npm** ≥ 10.x

### Bước 1 — Clone & Cài đặt dependencies

```bash
git clone <repository-url> CAB
cd CAB
npm install
```

### Bước 2 — Khởi động Infrastructure (7 containers)

```bash
docker-compose up -d
```

Lệnh trên khởi động PostgreSQL, Redis, Kafka, Zookeeper, MongoDB, Prometheus, và Grafana. Chờ đến khi tất cả containers ở trạng thái `healthy`:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Bước 3 — Cấu hình Environment

```bash
cp .env.example .env
# Chỉnh sửa .env nếu cần (mặc định đã cấu hình sẵn cho local development)
```

### Bước 4 — Khởi động toàn bộ Services

```bash
npm run start:all
```

Hệ thống sẵn sàng khi terminal hiển thị log từ đủ 11 services:

```
🚀 API Gateway     → http://127.0.0.1:3000/api
🔐 Auth Service    → http://127.0.0.1:4001
👤 User Service    → http://127.0.0.1:4002
🚖 Driver Service  → http://127.0.0.1:4003
📦 Booking Service → http://127.0.0.1:4004
🚗 Ride Service    → http://127.0.0.1:4005
💰 Pricing Service → http://127.0.0.1:4006
💳 Payment Service → http://127.0.0.1:4007
🔔 Notification    → http://127.0.0.1:4008
🤖 AI Service      → http://127.0.0.1:4010
⭐ Review Service  → http://127.0.0.1:3008
```

### Bước 5 — Chạy Test Suite

```bash
# Chạy toàn bộ 90 test cases (9 suites)
npm test

# Chạy từng level riêng lẻ
npm run test:level1     # Functional: REST API cơ bản
npm run test:level10    # Security: Zero Trust Architecture
```

### Monitoring Dashboards

| Công cụ | URL | Credentials |
|---|---|---|
| Prometheus | `http://localhost:9090` | — |
| Grafana | `http://localhost:3005` | `admin` / `cab_grafana_2024` |
| Gateway Metrics | `http://localhost:3000/metrics` | — |

---

## 7. Test Suite — 90 Test Cases

Toàn bộ test là **Integration Test** — gửi HTTP request thật đến các service đang chạy, không mock bất kỳ tầng nào. Mỗi test case kiểm tra một hành vi cụ thể xuyên suốt từ Gateway đến Database.

```
Test Suites:  9 passed, 9 total
Tests:       90 passed, 90 total
Time:        ~35 seconds
```

| Level | File | TCs | Scope | Mô tả |
|---|---|---|---|---|
| **L1** | `level1.integration.test.js` | TC01–TC10 | Functional | REST API cơ bản: Health check, CRUD Booking/Driver/User, ETA, Pricing, Notification, Auth lifecycle. |
| **L2** | `level2.integration.test.js` | TC11–TC20 | Functional | JWT lifecycle chi tiết: Token refresh, expiration handling, logout + Redis blacklist, concurrent session. |
| **L3** | `level3.integration.test.js` | TC21–TC30 | Integration | Kafka event flow: Publish/consume verification, WebSocket real-time push, GPS location tracking via Redis GEO. |
| **L4** | `level4.integration.test.js` | TC31–TC40 | Transactional | Saga Pattern: Booking state machine, Outbox atomic write, Idempotency key, Race condition (FOR UPDATE), Saga compensation (payment.failed → auto-cancel). |
| **L5** | `level5.integration.test.js` | TC41–TC50 | AI/ML Validation | AI service contracts: ETA boundary testing, fraud detection heuristics, demand forecast, data contract validation (no NaN, no undefined). |
| **L6** | `level6.integration.test.js` | TC51–TC60 | AI Agent | Composite scoring logic: Weight balancing, score ordering, OFFLINE filter, decision logging, concurrent safety (10 parallel requests), agent fallback. |
| **L8** | `level8.integration.test.js` | TC71–TC80 | Resilience | Circuit Breaker: Graceful degradation, fallback pricing, exponential backoff, CB stats endpoint, CB reset + recovery, DB pool under load. |
| **L9** | `level9.security.test.js` | TC81–TC90 | Security (OWASP) | Injection defense: SQL injection (parameterized query), XSS (sanitized output), Helmet headers, bcrypt verification, password masking, CORS policy. |
| **L10** | `level10.zerotrust.test.js` | TC91–TC100 | Security (Zero Trust) | Internal bypass: Missing/Expired/Tampered JWT, direct port access rejection, RBAC enforcement, ownership check (least privilege), rate limiting, audit trail verification. |

---

## 8. Cấu trúc Thư mục (Project Structure)

```
CAB/
├── api-gateway/                         # API Gateway (Express)
│   ├── app.js                           #   Middleware chain definition
│   ├── server.js                        #   HTTP + WebSocket (Socket.IO) bootstrap
│   └── src/
│       ├── middlewares/
│       │   ├── authMiddleware.js         #   JWT verification + 3-state error handling
│       │   ├── rateLimiter.js            #   Redis-backed rate limiting
│       │   └── metricsMiddleware.js      #   Prometheus metrics collection
│       ├── routes/                       #   Route → Service proxy mapping
│       └── services/                     #   Axios HTTP clients (with internal tokens)
│
├── services/                            # 10 Internal Microservices
│   ├── auth-service/                    #   JWT issuance, bcrypt hashing, token blacklist
│   ├── user-service/                    #   Customer profile management
│   ├── driver-service/                  #   Driver profile + availability state
│   ├── booking-service/                 #   Saga orchestrator
│   │   └── src/
│   │       ├── models/bookingModel.js   #     Transactional create + Outbox (BEGIN/COMMIT)
│   │       └── kafka/
│   │           ├── consumer.js          #     ride.assigned + payment.failed handler
│   │           └── outboxPublisher.js   #     Background worker: outbox → Kafka
│   ├── ride-service/                    #   GPS matching + Redis GEORADIUS
│   ├── pricing-service/                 #   Dynamic fare + surge calculation
│   ├── payment-service/                 #   Idempotent payment processing
│   ├── notification-service/            #   Kafka → Redis Pub/Sub → WebSocket
│   ├── ai-service/                      #   Composite scoring + ETA + fraud detection
│   └── review-service/                  #   MongoDB-based star ratings
│
├── shared/                              # Shared Library (npm workspace)
│   ├── circuitBreaker.js                #   Opossum CB factory + axios-retry
│   ├── constants/index.js               #   Service URLs, Kafka topics, Roles, Error codes
│   ├── middlewares/
│   │   ├── zeroTrustMiddleware.js       #   Internal service token verification
│   │   ├── auditLogger.js               #   Mutation-only security audit trail
│   │   ├── verifyInternalRequest.js     #   Legacy internal token check
│   │   ├── authorizeRoles.js            #   RBAC factory middleware
│   │   ├── errorHandler.js              #   Global error response formatter
│   │   └── responseWrapper.js           #   Consistent response envelope
│   └── events/                          #   Kafka producer/consumer utilities
│
├── infra/                               # Infrastructure Configuration
│   ├── kafka/                           #   KafkaJS client factory
│   ├── redis/                           #   ioredis client factory
│   ├── postgres/init.sql                #   Multi-database initialization script
│   ├── prometheus/prometheus.yml        #   Scrape configuration
│   └── grafana/provisioning/            #   Dashboard + datasource provisioning
│
├── __tests__/                           # 9 Test Suites (90 TCs)
├── frontend/                            # React + Vite SPA (Client Application)
├── docker-compose.yml                   # 7 Infrastructure containers
├── .github/workflows/ci.yml            # GitHub Actions CI pipeline
├── TESTING_GUIDE_LEVEL_[1-10].md       # Testing documentation (Vietnamese)
└── package.json                         # npm workspaces root
```

---

## 9. Tài liệu Kiểm thử (Testing Documentation)

Mỗi level có tài liệu hướng dẫn riêng dành cho giám khảo, bao gồm kịch bản kiểm thử thủ công (Red Team), kết quả kỳ vọng, và lệnh chạy tự động:

| File | Phạm vi kiểm thử |
|---|---|
| `TESTING_GUIDE_LEVEL_1.md` | **Functional** — REST API CRUD, Health check, Authentication flow cơ bản |
| `TESTING_GUIDE_LEVEL_2.md` | **Functional** — JWT token lifecycle, Refresh/Revoke/Blacklist |
| `TESTING_GUIDE_LEVEL_3.md` | **Integration** — Kafka event publishing/consuming, WebSocket, GPS tracking |
| `TESTING_GUIDE_LEVEL_4.md` | **Transactional** — Saga Pattern, Outbox Pattern, Idempotency, Race Condition |
| `TESTING_GUIDE_LEVEL_5.md` | **Validation** — AI/ML data contract, Boundary testing, Fallback mechanism |
| `TESTING_GUIDE_LEVEL_6.md` | **AI Logic** — Composite scoring, Agent decision log, Concurrent safety |
| `TESTING_GUIDE_LEVEL_7.md` | **Performance** — Load testing scenario, Scalability assessment |
| `TESTING_GUIDE_LEVEL_8.md` | **Resilience** — Circuit Breaker behavior, Graceful degradation, Recovery |
| `TESTING_GUIDE_LEVEL_9.md` | **Security (OWASP)** — SQL Injection, XSS, Header hardening, Data masking |
| `TESTING_GUIDE_LEVEL_10.md` | **Security (Zero Trust)** — Internal bypass, Token tampering, RBAC, Audit trail |

---

<p align="center">
  <em>CAB Ride-Hailing Microservices Platform — 10 Services • 90 Tests • Zero Trust</em>
</p>
