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

## 📋 Phần 3: Chi tiết Test Cases theo Cấu trúc Chuẩn (TC41 - TC50)

### TC41: ETA nằm trong biên hợp lý
* **Endpoint:** `POST /api/eta`
* **Data JSON nhập vào để test:**
  ```json
  {
    "distance_km": 5,
    "traffic_level": 0.3
  }
  ```
  ```json
  {
    "distance_km": 20,
    "traffic_level": 0.7
  }
  ```
  ```json
  {
    "distance_km": 50,
    "traffic_level": 0.1
  }
  ```
* **Kết quả mong đợi:** HTTP `200`, `eta > 0` và `eta < 120` cho tất cả case
* **Ý nghĩa kết quả:** Kiểm thử theo boundary cho hệ AI, đảm bảo ETA luôn trong dải hợp lý thay vì so khớp một con số cố định.

### TC42: Surge tăng khi demand > supply
* **Endpoint:** `POST /api/ai/surge`
* **Data JSON nhập vào để test:**
  ```json
  {
    "demand_index": 3.0,
    "supply_index": 1.0
  }
  ```
  ```json
  {
    "demand_index": 1.0,
    "supply_index": 2.0
  }
  ```
* **Kết quả mong đợi:** HTTP `200`; case 1 `surge > 1`; case 2 `surge = 1`; có `model_version`
* **Ý nghĩa kết quả:** Xác nhận logic kinh tế của surge pricing đúng và có floor an toàn không thấp hơn 1.

### TC43: Fraud detection theo ngưỡng tiền
* **Endpoint:** `POST /api/ai/fraud`
* **Data JSON nhập vào để test:**
  ```json
  {
    "amount": 6000000,
    "user_id": "user-fraud-test"
  }
  ```
  ```json
  {
    "amount": 100000,
    "user_id": "user-normal"
  }
  ```
* **Kết quả mong đợi:** HTTP `200`; case 1 `is_flagged = true`, `score > 0.8`; case 2 `is_flagged = false`, `score <= 0.8`; có `model_version`
* **Ý nghĩa kết quả:** Bảo đảm luật fraud heuristic phân loại đúng giao dịch rủi ro cao và giao dịch thường.

### TC44: Recommend top 3 driver theo score
* **Endpoint:** `POST /api/ai/recommend`
* **Data JSON nhập vào để test:**
  ```json
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
* **Kết quả mong đợi:** HTTP `200`; `recommendations.length <= 3`; danh sách sắp theo `score` giảm dần; có `model_version`
* **Ý nghĩa kết quả:** Đảm bảo hệ thống gợi ý top-N nhất quán và có cơ chế xếp hạng rõ ràng.

### TC45: Forecast trả schema hợp lệ và logic giờ cao điểm
* **Endpoint:** `GET /api/ai/forecast`
* **Data JSON nhập vào để test:** Không có body (GET)
* **Kết quả mong đợi:** HTTP `200`; `forecast` là mảng, có phần tử với `time` kiểu string và `predicted_demand` kiểu number; `08:00 > 03:00`; có `model_version`
* **Ý nghĩa kết quả:** Xác nhận API dự báo vừa đúng schema dữ liệu vừa đúng xu hướng nghiệp vụ theo thời gian.

### TC46: Tất cả AI endpoint có model_version
* **Endpoint:**
  1. `POST /api/eta`
  2. `POST /api/ai/surge`
  3. `POST /api/ai/fraud`
  4. `GET /api/ai/forecast`
* **Data JSON nhập vào để test:**
  ```json
  {
    "distance_km": 5,
    "traffic_level": 0.3
  }
  ```
  ```json
  {
    "demand_index": 2.0,
    "supply_index": 1.0
  }
  ```
  ```json
  {
    "amount": 100000,
    "user_id": "test-user"
  }
  ```
* **Kết quả mong đợi:** Mọi response đều có trường `model_version`
* **Ý nghĩa kết quả:** Bảo đảm khả năng trace model trong vận hành MLOps và audit khi retrain.

### TC47: Latency inference dưới 200ms
* **Endpoint:**
  1. `POST /api/eta`
  2. `POST /api/ai/surge`
* **Data JSON nhập vào để test:**
  ```json
  {
    "distance_km": 10,
    "traffic_level": 0.5
  }
  ```
  ```json
  {
    "demand_index": 2.0,
    "supply_index": 1.0
  }
  ```
* **Kết quả mong đợi:** Cả hai request trả HTTP `200` và thời gian phản hồi `< 200ms`
* **Ý nghĩa kết quả:** Chứng minh inference path nhẹ, phù hợp yêu cầu realtime.

### TC48: Drift input cực đoan vẫn xử lý an toàn
* **Endpoint:** `POST /api/eta`
* **Data JSON nhập vào để test:**
  ```json
  {
    "distance_km": 10,
    "traffic_level": 10.0
  }
  ```
* **Kết quả mong đợi:** HTTP `200`; `eta` là number hữu hạn, `eta > 0`, `eta <= 120`; server log có cảnh báo drift
* **Ý nghĩa kết quả:** Hệ thống có observability cho data drift nhưng vẫn giữ service ổn định.

### TC49: Fallback khi mô hình crash giả lập
* **Endpoint:** `POST /api/eta`
* **Data JSON nhập vào để test:**
  ```json
  {
    "distance_km": 5,
    "traffic_level": 0.5,
    "simulate_model_crash": true
  }
  ```
* **Kết quả mong đợi:** HTTP `200`; `eta = 15`; `is_fallback = true`; có `model_version`
* **Ý nghĩa kết quả:** Xác nhận cơ chế crash recovery hoạt động đúng, AI fail vẫn có kết quả fallback an toàn.

### TC50: Chặn abnormal input trước khi vào AI logic
* **Endpoint:** `POST /api/eta`
* **Data JSON nhập vào để test:**
  ```json
  {
    "distance_km": -5,
    "traffic_level": 0.3
  }
  ```
  ```json
  {
    "distance_km": "abc",
    "traffic_level": 0.3
  }
  ```
  ```json
  {}
  ```
* **Kết quả mong đợi:** Cả 3 trường hợp trả HTTP `400 Bad Request`
* **Ý nghĩa kết quả:** Bảo vệ lớp AI khỏi input rác, tránh NaN/crash và sai số lan truyền.

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
