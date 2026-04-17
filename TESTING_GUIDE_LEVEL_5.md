# 🤖 TESTING GUIDE - CAB BOOKING SYSTEM (LEVEL 5)

Tài liệu hướng dẫn nghiệm thu Level 5 (TC41 - TC50) — **AI Service Validation & MLOps**.

Level này khác biệt hoàn toàn so với 4 level trước vì chúng ta đang kiểm thử một hệ thống **xác suất (Probabilistic System)** thay vì hệ thống tất định (Deterministic System).

---

## 📚 Phần 1: Triết lý MLOps Testing

### Tại sao không test kết quả cố định?

Ở Level 1-4, ta test theo kiểu:
```
expect(status).toBe('REQUESTED')     // ← Giá trị cố định, tất định
expect(dbRes.rows.length).toBe(1)    // ← Đúng 1 row
```

Nhưng ở Level 5 — AI/ML, ta **không** test `1+1=2`. Lý do:
- **Mô hình AI là hàm xấp xỉ** — kết quả phụ thuộc vào input, traffic, context, và có thể thay đổi khi retrain model.
- **Drift (trôi dạt dữ liệu)** — dữ liệu Production thay đổi theo thời gian, model cũ có thể cho kết quả khác model mới.
- **Không có "đáp án đúng"** cho ETA — một chuyến đi 5km có thể mất 10 phút (không kẹt xe) hoặc 45 phút (kẹt xe nặng), cả hai đều đúng.

### Ba trụ cột kiểm thử AI:

| Trụ cột | Giải thích | Ví dụ |
|---------|-----------|-------|
| **Boundary Testing** | Kết quả phải nằm trong giới hạn hợp lý | ETA ∈ (0, 120) phút |
| **Fallback & Reliability** | Hệ thống không crash khi input bất thường | `distance_km = 99999` → trả fallback, không crash |
| **Observability** | Ghi log cảnh báo khi phát hiện anomaly | `traffic_level > 5.0` → log "[MLOps WARNING] Data Drift Detected" |

---

## 🛠️ Phần 2: Chuẩn bị môi trường

```bash
# 1. Khởi động hạ tầng Docker
docker-compose up -d

# 2. Cài đặt dependencies
npm install

# 3. Khởi động tất cả services
npm run start:all
```

Chờ dòng log: `🤖 AI Service is running on http://127.0.0.1:4010`

```bash
# Chạy bộ test Level 5
npm run test:level5
```

Kết quả mong đợi: **10/10 PASS**.

---

## 📋 Phần 3: Chi tiết 10 Test Cases (TC41 - TC50)

---

### 📌 NHÓM 1: Chuẩn hóa Hợp đồng Dữ liệu (TC41, TC42, TC44, TC46)

---

#### 🔬 TC41: ETA Boundaries — Kết quả luôn nằm trong (0, 120)

**Endpoint:** `POST /api/eta`

**Triết lý:** Với bất kỳ khoảng cách nội thành hợp lý nào (1-50km), ETA phải nằm trong khoảng (0, 120) phút. Nếu vượt 120 phút → có lỗi trong công thức tính.

**Test thủ công — 3 cases:**

```
POST http://localhost:3000/api/eta
Body: { "distance_km": 5, "traffic_level": 0.3 }
→ Kỳ vọng: eta > 0 && eta < 120

Body: { "distance_km": 20, "traffic_level": 0.7 }
→ Kỳ vọng: eta > 0 && eta < 120

Body: { "distance_km": 50, "traffic_level": 0.1 }
→ Kỳ vọng: eta > 0 && eta < 120
```

**Ý nghĩa:** Ta không test "5km phải mất đúng 11.76 phút" vì con số này phụ thuộc vào traffic. Ta test GIỚI HẠN — bất kể traffic bao nhiêu, ETA không được âm và không được vượt 2 giờ cho nội thành.

---

#### 🔬 TC42: Surge Pricing — demand / supply > 1 → surge > 1

**Endpoint:** `POST /api/ai/surge`

**Triết lý:** Khi nhu cầu (demand) cao hơn cung (supply), giá phải tăng. Đây là economics cơ bản, không phải AI phức tạp.

**Test thủ công:**

```
POST http://localhost:3000/api/ai/surge
Body: { "demand_index": 3.0, "supply_index": 1.0 }
→ Kỳ vọng: surge = 3.0 (hoặc > 1)
→ model_version: "v1.0.0"

Body: { "demand_index": 1.0, "supply_index": 2.0 }
→ Kỳ vọng: surge = 1.0 (floor — không giảm dưới 1)
```

**Công thức:** `surge = Math.max(1.0, demand_index / supply_index)`

---

#### 🔬 TC44: Top-3 Drivers — Composite Scoring

**Endpoint:** `POST /api/ai/recommend`

**Triết lý:** Không chỉ chọn driver gần nhất (TC28), mà phải xét tổng hợp: **60% khoảng cách** + **40% rating**. Trả về tối đa 3 tài xế.

**Test thủ công:**

```
POST http://localhost:3000/api/ai/recommend
Body:
{
  "drivers": [
    { "driver_id": "D1", "distance_km": 0.5, "rating": 4.9 },
    { "driver_id": "D2", "distance_km": 3.0, "rating": 4.5 },
    { "driver_id": "D3", "distance_km": 1.0, "rating": 4.8 },
    { "driver_id": "D4", "distance_km": 10.0, "rating": 5.0 },
    { "driver_id": "D5", "distance_km": 0.2, "rating": 3.0 }
  ]
}
```

**Kỳ vọng:**
- `recommendations.length <= 3`
- Sắp xếp theo `score` giảm dần
- D5 (rất gần) và D1 (gần + rating cao) nên nằm trong top 3
- `model_version` có mặt

**Công thức Composite Score:**
```
score = (1/(distance + 0.1)) × 0.6 + (rating/5.0) × 0.4
```

---

#### 🔬 TC46: Model Version — Mọi response đều có phiên bản

**Endpoint:** Tất cả AI endpoints

**Triết lý:** Trong Production, khi model được retrain, ta cần biết response được tạo bởi version nào. Đây là MLOps 101 — traceability.

**Test:** Gọi 4 endpoints (`/api/eta`, `/api/ai/surge`, `/api/ai/fraud`, `/api/ai/forecast`), verify tất cả đều chứa `model_version`.

---

### 📌 NHÓM 2: Sức chịu đựng & Fallback (TC47, TC49, TC50)

---

#### 🔬 TC47: Latency — Phản hồi < 200ms

**Endpoint:** `POST /api/eta`

**Triết lý:** AI inference phải chạy trên RAM (in-memory computation), không query DB, không gọi API ngoài. Nếu > 200ms → có bottleneck cần optimize.

**Test tự động:**
```javascript
const start = Date.now();
const res = await request(API_BASE).post('/api/eta').send({ ... });
const duration = Date.now() - start;
expect(duration).toBeLessThan(200); // < 200ms
```

**Test thủ công:** Dùng Postman → tab "Tests" → xem "Response time" ở góc phải.

---

#### 🔬 TC49: Model Fallback — Crash Recovery

**Endpoint:** `POST /api/eta`

**Triết lý:** Khi input cực đoan (distance = 99999km), model phải trả về giá trị có giới hạn (max 120 phút), KHÔNG crash, KHÔNG trả Infinity/NaN.

**Test thủ công:**

```
POST http://localhost:3000/api/eta
Body: { "distance_km": 99999, "traffic_level": 0.9 }
→ Kỳ vọng: status=200, eta=120 (boundary cap), model_version present
→ KHÔNG: eta=Infinity, eta=NaN, status=500
```

---

#### 🔬 TC50: Abnormal Input — Chặn ngay, không để AI tính toán

**Endpoint:** `POST /api/eta`

**Triết lý:** Input không hợp lệ (negative, string, null) phải bị chặn TRƯỚC KHI vào logic AI. Nếu không, có thể gây ra NaN, crash, hoặc kết quả sai.

**Test thủ công — 3 cases:**

```
Body: { "distance_km": -5, "traffic_level": 0.3 }
→ Kỳ vọng: 400 Bad Request, message rõ ràng

Body: { "distance_km": "abc", "traffic_level": 0.3 }
→ Kỳ vọng: 400 Bad Request

Body: {}
→ Kỳ vọng: 400 Bad Request
```

---

### 📌 NHÓM 3: MLOps — Fraud, Forecast & Drift (TC43, TC45, TC48)

---

#### 🔬 TC43: Fraud Detection — Heuristic Rule-Based

**Endpoint:** `POST /api/ai/fraud`

**Triết lý:** Phát hiện giao dịch gian lận bằng luật heuristic (không phải ML model phức tạp). Nếu amount > 5,000,000đ → đánh cờ.

**Test thủ công:**

```
POST http://localhost:3000/api/ai/fraud
Body: { "amount": 6000000, "user_id": "user-001" }
→ Kỳ vọng:
{
  "is_flagged": true,
  "score": 0.9,
  "reason": "Amount exceeds 5,000,000 VND threshold",
  "model_version": "v1.0.0"
}

Body: { "amount": 100000, "user_id": "user-002" }
→ Kỳ vọng:
{
  "is_flagged": false,
  "score": 0.1,
  "reason": "Normal transaction within safe range"
}
```

**Bảng luật Fraud:**

| Mức tiền | fraud_score | is_flagged |
|----------|------------|------------|
| > 5,000,000đ | 0.9 | ✅ true |
| > 2,000,000đ | 0.5 | ❌ false |
| ≤ 2,000,000đ | 0.1 | ❌ false |

---

#### 🔬 TC45: Forecast API — Dự báo nhu cầu theo giờ

**Endpoint:** `GET /api/ai/forecast`

**Triết lý:** Trả về dự báo nhu cầu xe theo 24 khung giờ. Giờ cao điểm (7-9h sáng, 17-19h chiều) phải có demand cao hơn giờ khuya (0-5h).

**Test thủ công:**

```
GET http://localhost:3000/api/ai/forecast
→ Kỳ vọng:
{
  "forecast": [
    { "time": "00:00", "predicted_demand": 0.3 },
    ...
    { "time": "08:00", "predicted_demand": 1.8 },
    ...
    { "time": "17:00", "predicted_demand": 1.8 },
    ...
  ],
  "model_version": "v1.0.0"
}
```

**Kiểm tra logic:**
- `08:00` (sáng rush) > `03:00` (khuya) → Đúng logic kinh doanh
- Array phải có 24 phần tử (mỗi giờ 1 entry)
- Mỗi entry phải có cả `time` (string) và `predicted_demand` (number)

---

#### 🔬 TC48: Drift Detection — Cảnh báo dữ liệu bất thường

**Endpoint:** `POST /api/eta`

**Triết lý:** Khi input vượt xa ngưỡng bình thường (traffic_level > 5.0 — trong thực tế traffic thường 0-1), hệ thống phải:
1. **KHÔNG crash** — vẫn trả về kết quả hợp lệ
2. **In log cảnh báo** — `[MLOps WARNING] Data Drift Detected`

**Test thủ công:**

```
POST http://localhost:3000/api/eta
Body: { "distance_km": 10, "traffic_level": 10.0 }
→ Kỳ vọng:
  - status: 200
  - eta > 0 && eta <= 120 (bounded, không Infinity)
  - Server logs: "[MLOps WARNING] Data Drift Detected - traffic_level threshold exceeded"
```

**Cách verify log:**
```bash
# Xem server log (tìm dòng MLOps WARNING)
# Khi chạy npm run start:all, log hiện trực tiếp trên terminal
```

**Ý nghĩa trong Production:** Log drift này thể hiện cho team MLOps biết dữ liệu đầu vào đã thay đổi bất thường. Team sẽ quyết định: retrain model? Điều chỉnh ngưỡng? Đây là cơ chế **Observability** — một trong những trụ cột của MLOps maturity.

---

## 🏗️ Phần 4: Kiến trúc AI Service

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────────────┐
│   Client     │────▶│   API Gateway    │────▶│      AI Service           │
│  (Postman)   │     │ (Rate Limit,     │     │                           │
│              │     │  Proxy)          │     │  ┌──────────────────────┐  │
└─────────────┘     └──────────────────┘     │  │  Input Validation    │  │
                                              │  │  (TC50: negative,    │  │
                                              │  │   string, null)      │  │
                                              │  └──────────┬───────────┘  │
                                              │             ↓              │
                                              │  ┌──────────────────────┐  │
                                              │  │  Drift Detection     │  │
                                              │  │  (TC48: threshold    │  │
                                              │  │   check + log)       │  │
                                              │  └──────────┬───────────┘  │
                                              │             ↓              │
                                              │  ┌──────────────────────┐  │
                                              │  │  AI Model Logic      │  │
                                              │  │  (ETA, Surge, Fraud, │  │
                                              │  │   Recommend, Forecast│  │
                                              │  └──────────┬───────────┘  │
                                              │             ↓              │
                                              │  ┌──────────────────────┐  │
                                              │  │  Boundary Enforcement│  │
                                              │  │  (TC41: 0<eta<120)   │  │
                                              │  │  + model_version     │  │
                                              │  └──────────────────────┘  │
                                              └───────────────────────────┘
```

**Pipeline xử lý mỗi request AI:**
1. **Input Validation** → Chặn garbage input (TC50)
2. **Drift Detection** → Log cảnh báo nếu bất thường (TC48)
3. **Model Logic** → Tính toán + try/catch fallback (TC49)
4. **Boundary Enforcement** → Clamp kết quả vào giới hạn (TC41)
5. **Response** → Đính kèm `model_version` (TC46)

---

## 🎯 Phần 5: Tổng kết

| Level | Chủ đề | Số TC | Trạng thái |
|-------|--------|-------|------------|
| 1 | Basic API & Flow | 10 | ✅ PASS |
| 2 | Validation & Edge Cases | 10 | ✅ PASS |
| 3 | Integration & Resilience | 10 | ✅ PASS |
| 4 | Transaction & Data Consistency | 10 | ✅ PASS |
| 5 | AI Service Validation & MLOps | 10 | ✅ PASS |
| **Tổng** | | **50** | **✅ ALL PASS** |

**Hệ thống CAB AI Service đạt MLOps Level 1 (Manual) với:**
- ✅ Boundary Testing — không test giá trị tuyệt đối, test giới hạn
- ✅ Model Versioning — truy xuất nguồn gốc prediction
- ✅ Drift Detection — cảnh báo dữ liệu bất thường
- ✅ Fraud Heuristics — phát hiện giao dịch gian lận
- ✅ Demand Forecasting — dự báo nhu cầu deterministic
- ✅ Composite Scoring — top-N driver recommendation
- ✅ Fallback & Crash Recovery — không bao giờ crash
- ✅ Input Validation — chặn garbage input trước AI

**🚀 AI Service sẵn sàng cho Production!**
