# 🚀 CẨM NANG TESTING LEVEL 7 — PERFORMANCE & LOAD TEST (TC61 → TC70)

> **Đối tượng**: Kỹ sư muốn test sức chịu tải hệ thống CAB.
> **Công cụ**: k6 (Load Testing) + Prometheus (Metrics) + Grafana (Dashboard).
> **Nguyên tắc**: KHÔNG dùng Jest/Supertest. Performance test bắn HTTP thật.

---

## 📦 PHẦN 1: CÀI ĐẶT CÔNG CỤ

### 1.1 Cài k6

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (MSI):**
- Tải từ [https://dl.k6.io/msi/k6-latest-amd64.msi](https://dl.k6.io/msi/k6-latest-amd64.msi)

**MacOS (Homebrew):**
```bash
brew install k6
```

**Linux (Debian/Ubuntu):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**Verify:**
```bash
k6 version
```

### 1.2 Đảm bảo hệ thống đang chạy

```bash
# Terminal 1: Infra (Postgres, Redis, Kafka, Prometheus, Grafana)
docker-compose up -d

# Terminal 2: Tất cả services
npm run start:all
```

Chờ cho đến khi thấy:
```
🚀 API Gateway is running on http://127.0.0.1:3000/api
```

---

## 🔥 PHẦN 2: CHẠY CÁC BÀI TEST

### 2.1 TC61 + TC68: Booking Load Test (ETA Throughput + P95 Latency)

```bash
k6 run load-tests/booking-load.js
```

**Cấu hình:**
- Ramp up: 30s → 50 VUs → 1 phút → 200 VUs
- Duy trì: 2 phút ở 200 VUs
- Ramp down: 30s

**Thresholds (tự động PASS/FAIL):**
| Metric | Ngưỡng | TC |
|--------|--------|----|
| Error Rate | < 5% | TC61 |
| P95 Latency | < 300ms | TC68 |

**Kết quả mẫu:**
```
═══════════════════════════════════════════════════
  📊 BOOKING LOAD TEST RESULTS
═══════════════════════════════════════════════════
  Total Requests:  45000
  P95 Latency:     12.34ms
  Error Rate:      0.02%
  TC61:            ✅ PASS (errors < 5%)
  TC68:            ✅ PASS (p95 < 300ms)
═══════════════════════════════════════════════════
```

---

### 2.2 TC62 + TC63: AI Spike Test (Đột ngột bắn tải)

```bash
k6 run load-tests/ai-spike.js
```

**Cấu hình:**
- Baseline: 10 VUs → **ĐỘT NGỘT 500 VUs** trong 5 giây
- Duy trì spike: 30 giây
- Recovery: giảm về 10 VUs, quan sát 20 giây

**Mục tiêu:**
| Metric | Ngưỡng | TC |
|--------|--------|----|
| ETA Error Rate | < 20% | TC62 |
| Pricing Error Rate | < 20% | TC63 |
| Spike P95 | < 1000ms | Acceptable during spike |

> [!WARNING]
> **Rate Limit (TC67)** sẽ kick in ở 100 req/phút/IP! Responses 429 là BÌNH THƯỜNG — chứng minh hệ thống tự bảo vệ. k6 test đã tính HTTP 429 là OK (không phải error).

---

### 2.3 TC69: Peak Hours Sustained Test (Giờ cao điểm)

```bash
k6 run load-tests/peak-hours.js
```

**Cấu hình:**
- ⬆️ Ramp up: 3 phút (0 → 100 VUs)
- 🏙️ Peak: 5 phút (duy trì 100 VUs)
- ⬇️ Ramp down: 2 phút (100 → 0)
- **Tổng: 10 phút**

**Traffic mix (mô phỏng thực tế):**
- 60% ETA requests
- 25% Surge requests
- 15% Orchestrate requests (nặng nhất)

**Mục tiêu:**
| Metric | Ngưỡng |
|--------|--------|
| Overall P95 | < 500ms |
| Error Rate | < 5% |
| Latency Trend | Không tăng dần (stable) |

> [!IMPORTANT]
> Nếu latency **tăng liên tục** trong 5 phút duy trì, đó là dấu hiệu **memory leak** hoặc **connection pool cạn**. Kiểm tra DB Pool (`max: 20`) và Redis connections.

---

## 📊 PHẦN 3: GIÁM SÁT BẰNG PROMETHEUS + GRAFANA

### 3.1 Prometheus (Thu thập Metrics)

**URL:** [http://localhost:9090](http://localhost:9090)

Prometheus đã được cấu hình scrape API Gateway mỗi 15 giây:
```yaml
# infra/prometheus/prometheus.yml
scrape_configs:
  - job_name: 'api-gateway'
    metrics_path: /metrics
    static_configs:
      - targets: ['host.docker.internal:3000']
```

**Query mẫu để kiểm tra TC68 (P95):**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Query kiểm tra Request Rate:**
```promql
rate(http_request_duration_seconds_count[1m])
```

### 3.2 Grafana (Dashboard trực quan)

**URL:** [http://localhost:3005](http://localhost:3005)

**Đăng nhập:**
- Username: `admin`
- Password: `cab_grafana_2024`

**Bước tạo Dashboard:**

1. **Thêm Data Source** (nếu chưa có):
   - Vào ⚙️ Configuration → Data Sources → Add data source
   - Chọn **Prometheus**
   - URL: `http://prometheus:9090` (trong Docker network)
   - Click **Save & Test**

2. **Tạo Panel cho TC68 (P95 Latency):**
   - Tạo Dashboard mới → Add Panel
   - Query:
     ```promql
     histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route="/api/eta"}[1m])) by (le))
     ```
   - Panel Title: **ETA P95 Latency**
   - Thresholds: Green < 0.3, Red > 0.3 (300ms)

3. **Tạo Panel cho Request Rate:**
   - Query:
     ```promql
     sum(rate(http_request_duration_seconds_count[1m])) by (route)
     ```
   - Panel Title: **Requests per Second by Route**

4. **Tạo Panel cho Error Rate (TC67 - Rate Limit):**
   - Query:
     ```promql
     sum(rate(http_request_duration_seconds_count{status_code="429"}[1m]))
     ```
   - Panel Title: **Rate Limited Requests (429)**

### 3.3 TC66: Kiểm tra Cache Hit Rate

**Cách 1: API trực tiếp**
```bash
curl http://127.0.0.1:3000/api/ai/cache-stats
```

Response:
```json
{
  "cache_hits": 4523,
  "cache_misses": 890,
  "total_requests": 5413,
  "hit_rate_percent": 83.54
}
```

**Cách 2: Trong Grafana** — Tạo panel Stat hiển thị giá trị từ API (hoặc thêm custom Prometheus counter nếu cần).

> [!TIP]
> Cache TTL = 5 giây. Khi bắn tải với cùng distance_km + traffic_level, các request sau sẽ trả lại kết quả từ Redis (không tính toán lại). Hit Rate > 70% là tốt!

---

## 🛡️ PHẦN 4: CẤU HÌNH BẢO VỆ HỆ THỐNG

### TC65: DB Connection Pool

Tất cả service đã được cấu hình:
```javascript
const pool = new Pool({
  max: 20,                       // Tối đa 20 connection
  idleTimeoutMillis: 30000,      // Đóng idle connection sau 30s
  connectionTimeoutMillis: 2000, // Fail fast nếu không lấy được connection trong 2s
});
```

> [!CAUTION]
> Nếu `max: 20` không đủ khi bắn 500 VUs → sẽ thấy lỗi `connection timeout`. Đây là **hành vi đúng** — Pool tự bảo vệ DB không bị overwhelm.

### TC67: Rate Limiting

```javascript
// api-gateway/src/middlewares/rateLimiter.js
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 phút
  max: 200,             // 200 requests / phút / IP
  // Vượt quá → HTTP 429 Too Many Requests
});
```

**Kiểm tra thủ công:**
```bash
# Bắn liên tục > 200 lần trong 1 phút
for i in $(seq 1 210); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/eta \
    -H "Content-Type: application/json" \
    -d '{"distance_km":5,"traffic_level":0.3}'
done
# Request 201+ sẽ trả về 429
```

---

## 🐳 PHẦN 5: TC70 — HORIZONTAL SCALING

### Giả lập Horizontal Scaling với Docker Compose

> [!NOTE]
> TC70 test khả năng hệ thống scale bằng cách chạy nhiều instance của cùng 1 service.

**Bước 1:** Dockerize booking-service (nếu chưa có Dockerfile):
```dockerfile
# services/booking-service/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4004
CMD ["node", "server.js"]
```

**Bước 2:** Thêm vào `docker-compose.yml`:
```yaml
booking-service:
  build: ./services/booking-service
  deploy:
    replicas: 3
  environment:
    POSTGRES_HOST: postgres
    REDIS_HOST: redis
  networks:
    - cab_network
```

**Bước 3:** Scale lên 3 instances:
```bash
docker-compose up -d --scale booking-service=3
```

**Bước 4:** Cấu hình Load Balancer (nginx hoặc API Gateway) để round-robin giữa 3 instance.

**Bước 5:** Chạy lại k6 test và so sánh:
```bash
# Trước khi scale
k6 run load-tests/peak-hours.js > results-1-instance.json

# Sau khi scale lên 3
k6 run load-tests/peak-hours.js > results-3-instances.json
```

Kỳ vọng: Throughput tăng ~2-3x, P95 giảm.

---

## 📋 BẢNG TÓM TẮT TC61 → TC70

| TC | Tên | Công cụ | Cách verify |
|----|------|---------|-------------|
| 61 | Throughput | k6 `booking-load.js` | Error rate < 5% ở 200 VUs |
| 62 | AI Spike | k6 `ai-spike.js` | ETA không crash ở 500 VUs |
| 63 | Pricing Spike | k6 `ai-spike.js` | Pricing không crash ở 500 VUs |
| 64 | TC Reserved | — | — |
| 65 | DB Pool | Code review | `max:20, connectionTimeout:2000` |
| 66 | Cache Hit | `GET /api/ai/cache-stats` | hit_rate > 70% sau load test |
| 67 | Rate Limit | k6 hoặc curl loop | Request 101+ → HTTP 429 |
| 68 | P95 Latency | k6 `booking-load.js` | p(95) < 300ms |
| 69 | Peak Hours | k6 `peak-hours.js` | 10 phút stable, no latency drift |
| 70 | Horizontal Scale | Docker `--scale=3` | Throughput tăng sau khi scale |

---

## ✅ QUY TRÌNH TEST ĐẦY ĐỦ

```bash
# 1. Khởi động infra + services
docker-compose up -d
npm run start:all

# 2. Chạy Load Test
k6 run load-tests/booking-load.js      # TC61, TC68
k6 run load-tests/ai-spike.js          # TC62, TC63
k6 run load-tests/peak-hours.js        # TC69

# 3. Kiểm tra Cache
curl http://localhost:3000/api/ai/cache-stats

# 4. Xem Dashboard
# Mở http://localhost:3005 (Grafana) → xem P95, RPS, Error Rate

# 5. Chạy lại Jest để đảm bảo không regression
npm test
```

> Nếu tất cả k6 thresholds PASS + Grafana dashboard ổn định → **Level 7 Hoàn thành** 🎉
