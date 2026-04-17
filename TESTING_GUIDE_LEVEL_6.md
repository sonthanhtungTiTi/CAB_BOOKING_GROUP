# 🤖 CẨM NANG TESTING LEVEL 6 — AI AGENT LOGIC (TC51 → TC60)

> **Phong cách: Cầm tay chỉ việc**
> Đọc xong là test được ngay, không cần đoán mò.

---

## 📖 TRƯỚC KHI TEST: Tại sao Level 6 khác biệt?

### Level 5 vs Level 6

| Level 5 (AI Validation) | Level 6 (AI Agent Logic) |
|---|---|
| Test **kết quả tĩnh** — gửi số, kiểm tra output | Test **theo ngữ cảnh** — cùng 1 API nhưng input khác → Agent ra quyết định khác |
| Mỗi API là **công cụ đơn lẻ** (ETA, Surge, Fraud...) | Agent **điều phối nhiều công cụ** tuần tự (ETA → Pricing → Pick Driver) |
| Không có "lý do" — chỉ có số | Agent giải thích **TẠI SAO** chọn (decision_log) |

### Triết lý Context-Driven Testing

> _"Cùng 1 endpoint `/api/ai/orchestrate`, nhưng thay đổi danh sách tài xế (xa/gần, online/offline, rating cao/thấp) → Agent PHẢI ra quyết định khác nhau. Nếu kết quả luôn giống nhau = Agent giả, code chống chế."_

---

## 🚀 CHUẨN BỊ

### 1. Khởi động hệ thống

```bash
# Terminal 1: Chạy tất cả services
npm run start:all
```

Chờ cho đến khi thấy:
```
🚀 API Gateway is running on http://127.0.0.1:3000/api
🤖 AI Service is running on http://127.0.0.1:4010
```

### 2. Chạy test tự động

```bash
# Chạy riêng Level 6
npm run test:level6

# Hoặc chạy toàn bộ (Level 1-6)
npm test
```

---

## 🧪 HƯỚNG DẪN TEST THỦ CÔNG (Postman)

### Endpoint chính

```
POST http://127.0.0.1:3000/api/ai/orchestrate
Content-Type: application/json
```

---

### TC 51-53: Composite Scoring (Chọn tài xế theo điểm tổng hợp)

**📋 Dán payload này vào Postman Body (raw JSON):**

```json
{
  "drivers": [
    {
      "driver_id": "D-CLOSE-LOW",
      "distance_km": 0.5,
      "rating": 3.2,
      "status": "ONLINE",
      "price": 30000
    },
    {
      "driver_id": "D-FAR-HIGH",
      "distance_km": 8.0,
      "rating": 4.9,
      "status": "ONLINE",
      "price": 80000
    },
    {
      "driver_id": "D-MID-MID",
      "distance_km": 2.0,
      "rating": 4.5,
      "status": "ONLINE",
      "price": 45000
    },
    {
      "driver_id": "D-OFFLINE",
      "distance_km": 0.3,
      "rating": 5.0,
      "status": "OFFLINE",
      "price": 20000
    }
  ],
  "distance_km": 5,
  "traffic_level": 0.3
}
```

**🔍 Cách đọc kết quả:**

```json
{
  "selected_driver": {
    "driver_id": "D-CLOSE-LOW",   // ← Gần nhất, tuy rating thấp nhưng tổng điểm cao nhất
    "score": 0.8234,              // ← Composite Score (distance 40% + rating 35% + price 25%)
    "all_scores": [...]           // ← Bảng điểm của TẤT CẢ ứng viên
  },
  "eta": 11.76,                   // ← Được tính TRƯỚC (Tool 1)
  "price": 65000,                 // ← Được tính SAU, dựa vào ETA (Tool 2)
  "is_fallback": false,
  "decision_log": "[AGENT DECISION] Selected Driver D-CLOSE-LOW...",
  "orchestration_steps": [...]    // ← Pipeline: ETA → Pricing → SelectDriver
}
```

> [!TIP]
> **Thử thay đổi**: Đổi `D-CLOSE-LOW` thành `distance_km: 10` (xa hơn) → chạy lại xem Agent có thay đổi quyết định không. Nếu Agent thay đổi = Agent THẬT SỰ suy luận!

**Kiểm tra:**
- ✅ `D-OFFLINE` **KHÔNG BAO GIỜ** xuất hiện trong `selected_driver` (TC57)
- ✅ `all_scores` được sắp **giảm dần** (TC52)
- ✅ Khi 2 tài xế cùng khoảng cách, rating cao hơn phải thắng (TC53)

---

### TC 54: Tool Calling — Pipeline tuần tự

**Nhìn vào `orchestration_steps` trong response:**

```json
"orchestration_steps": [
  { "tool": "calculateETA",      "input": {...}, "output": { "eta": 11.76 } },
  { "tool": "calculatePricing",  "input": {...}, "output": { "price": 65000 } },
  { "tool": "selectBestDriver",  "input": {...}, "output": { "selected": "D-CLOSE-LOW" } }
]
```

> [!IMPORTANT]
> **THỨ TỰ PHẢI LÀ**: `calculateETA` → `calculatePricing` → `selectBestDriver`.
> Agent gọi ETA trước, lấy kết quả nạp vào Pricing, rồi mới chọn Driver. **Không được gọi lung tung.**

---

### TC 55: Thiếu Data — Agent tự bổ sung Default

**📋 Payload thiếu `rating` và `traffic_level`:**

```json
{
  "drivers": [
    { "driver_id": "D-NO-RATING", "distance_km": 2.0, "status": "ONLINE", "price": 40000 },
    { "driver_id": "D-NORMAL",    "distance_km": 3.0, "rating": 4.5, "status": "ONLINE", "price": 50000 }
  ],
  "distance_km": 5
}
```

**Kiểm tra:**
- ✅ Response trả về **không có NaN** ở bất kỳ đâu
- ✅ `eta` là số dương hợp lệ
- ✅ `price` là số dương hợp lệ
- ✅ Driver thiếu rating được gán mặc định `3.0` (vẫn tham gia xếp hạng)

---

### TC 57: Filter Offline

Dùng payload TC51-53 ở trên. Kiểm tra:
- ✅ `D-OFFLINE` (status `OFFLINE`) **không xuất hiện** trong `all_scores`
- ✅ `all_scores.length` = 3 (chỉ có 3 driver ONLINE)

---

### TC 58: Decision Log — Kiểm tra Console

> [!IMPORTANT]
> **Mở Terminal đang chạy `npm run start:all`** và gửi request từ Postman.

Bạn sẽ thấy các dòng log sau trong Terminal:

```
[AGENT] Filtered 4 → 3 ONLINE drivers
[AGENT SCORE] Driver D-CLOSE-LOW: score=0.8234 (dist=..., rating=..., price=...)
[AGENT SCORE] Driver D-FAR-HIGH: score=0.4321 (dist=..., rating=..., price=...)
[AGENT SCORE] Driver D-MID-MID: score=0.6543 (dist=..., rating=..., price=...)
[AGENT TOOL] Step 1 — calculateETA(5km, traffic=0.3) → 11.76 min
[AGENT TOOL] Step 2 — calculatePricing(5km, eta=11.76, traffic=0.3) → 57500 VND
[AGENT DECISION] Selected Driver D-CLOSE-LOW. Reason: Best composite score (0.8234). ETA: ...min
```

Nếu thấy dòng `[AGENT DECISION]` = TC58 PASS ✅

---

### TC 60: Agent Fallback — Mô phỏng Agent sập

**📋 Payload kèm cờ `simulate_agent_fail: true`:**

```json
{
  "drivers": [
    { "driver_id": "D-CLOSE-LOW", "distance_km": 0.5, "rating": 3.2, "status": "ONLINE", "price": 30000 },
    { "driver_id": "D-FAR-HIGH",  "distance_km": 8.0, "rating": 4.9, "status": "ONLINE", "price": 80000 },
    { "driver_id": "D-OFFLINE",   "distance_km": 0.3, "rating": 5.0, "status": "OFFLINE", "price": 20000 }
  ],
  "distance_km": 5,
  "traffic_level": 0.3,
  "simulate_agent_fail": true
}
```

**🔍 Kết quả mong đợi:**

```json
{
  "selected_driver": {
    "driver_id": "D-CLOSE-LOW"   // ← Fallback: lấy ONLINE đầu tiên trong mảng
  },
  "is_fallback": true,           // ← CỜ FALLBACK BẬT
  "decision_log": "[AGENT DECISION] FALLBACK — Selected first ONLINE driver D-CLOSE-LOW (rule-based, agent failed).",
  "eta": 11.76,                  // ← ETA và Price vẫn được tính (trước khi Agent sập)
  "price": 57500
}
```

**Nhìn Terminal sẽ thấy:**
```
[AGENT RETRY] Attempt 1/3 failed: Simulated Agent Internal Failure
[AGENT RETRY] Attempt 2/3 failed: Simulated Agent Internal Failure
[AGENT RETRY] Attempt 3/3 failed: Simulated Agent Internal Failure
[AGENT FALLBACK] All retries exhausted: Simulated Agent Internal Failure
[AGENT DECISION] FALLBACK — Selected first ONLINE driver D-CLOSE-LOW (rule-based, agent failed).
```

> [!CAUTION]
> Agent thử lại 3 lần (1 lần gốc + 2 retry). Cả 3 đều thất bại → chuyển sang **Rule-based Fallback**: bỏ qua tính điểm, chỉ lấy driver ONLINE đầu tiên. Hệ thống **KHÔNG SẬP** — vẫn trả HTTP 200.

---

### TC 59: Concurrent (Chạy song song)

> Test này khó làm thủ công trên Postman. Nên dùng test tự động:

```bash
npm run test:level6
```

Test tự động sẽ bắn **10 requests đồng thời** bằng `Promise.all()`. Mỗi request có bộ tài xế riêng (`D-PARA-0-A`, `D-PARA-1-A`, ...). Verify:
- ✅ Tất cả 10 trả về 200 OK
- ✅ Mỗi response chứa driver thuộc **đúng** bộ data của request đó (không bị lẫn)

---

## 📊 BẢNG TÓM TẮT TC51 → TC60

| TC | Tên | Input đặc biệt | Expect |
|----|------|-----------------|--------|
| 51 | Composite Scoring | 3 online + 1 offline | Chọn theo điểm, không chọn offline |
| 52 | Score Ordering | Như TC51 | `all_scores` giảm dần |
| 53 | Weight Balancing | 2 driver cùng distance | Rating cao hơn thắng |
| 54 | Tool Calling | Bất kỳ | Steps: ETA → Pricing → Driver |
| 55 | Missing Data | Thiếu rating, traffic | Không NaN, dùng default |
| 56 | Retry (Normal) | `simulate_agent_fail: false` | `is_fallback: false` |
| 57 | Filter Offline | Mix online/offline | Chỉ online trong `all_scores` |
| 58 | Decision Log | Bất kỳ | `decision_log` chứa `[AGENT DECISION]` |
| 59 | Concurrent | 10 request song song | Tất cả 200, data không lẫn |
| 60 | Fallback | `simulate_agent_fail: true` | `is_fallback: true`, driver ONLINE đầu tiên |

---

## ✅ KẾT LUẬN

Nếu tất cả 60 test cases (Level 1-6) pass:

```
Test Suites: 6 passed, 6 total
Tests:       60 passed, 60 total
```

→ Hệ thống CAB đã hoàn thành **AI Agent Orchestration** với:
- 🧠 **Composite Scoring** — Quyết định dựa trên toán học, không random
- 🔗 **Tool Calling Pipeline** — Gọi tuần tự ETA → Pricing → Driver
- 🛡️ **Retry + Fallback** — Agent sập → tự phục hồi bằng Rule-based
- 🔒 **Stateless Design** — 10 request song song không xung đột data
- 📋 **Decision Logging** — Mọi quyết định đều có lý do rõ ràng
