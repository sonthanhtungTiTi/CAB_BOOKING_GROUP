# Hướng Dẫn Kiểm Thử - Trình Độ 2 (Validation & Edge Cases)

Tài liệu này cung cấp hướng dẫn chi tiết để kiểm thử các kịch bản ngoại lệ, bọc lót lỗi (fail-safe), và validation của Hệ thống Đặt Xe CAB. Để các bài kiểm tra chạy được, hãy đảm bảo hệ thống đã được khởi động hoàn toàn (`npm run start:all`).

---

## Mục Lục Tóm Tắt Test Case (TC11 - TC20)

| Test Case | Mục tiêu kiểm thử | Endpoint | Kết quả mong đợi |
|---|---|---|---|
| TC11 | Thiếu trường bắt buộc (`pickup`) | `POST /api/bookings` | `400 Bad Request` |
| TC12 | Sai định dạng tọa độ (`lat/lng`) | `POST /api/bookings` | `422 Unprocessable Entity` |
| TC13 | Không có tài xế khả dụng | `POST /api/bookings` | `200 OK`, `status: FAILED`, `No drivers available` |
| TC14 | Payment method không hợp lệ | `POST /api/payments` | `400 Bad Request` |
| TC15 | ETA với quãng đường bằng 0 | `POST /api/eta` | `200 OK`, `eta: 0` |
| TC16 | Surge pricing + edge case chia 0 | `POST /api/pricing/calculate` | `200 OK`, giá tăng hợp lệ, không crash |
| TC17 | Fraud API thiếu/đủ trường dữ liệu | `POST /api/payment/fraud` | Thiếu trường: `400`; đủ trường: `200` |
| TC18 | Token hết hạn | `GET /api/bookings` | `401 Unauthorized`, message chứa `expired` |
| TC19 | Chống submit trùng (Idempotency) | `POST /api/bookings` | Lần 1: `201`; lần 2 cùng key: `200`, cùng `booking_id` |
| TC20 | Payload vượt giới hạn (> 1MB) | `POST /api/bookings` | `413 Payload Too Large` |

Đi tới phần chi tiết:

*   [TC11: Thiếu trường dữ liệu bắt buộc (Missing Field)](#tc11-thiếu-trường-dữ-liệu-bắt-buộc-missing-field)
*   [TC12: Sai định dạng dữ liệu (Wrong Format)](#tc12-sai-định-dạng-dữ-liệu-wrong-format)
*   [TC13: Không có tài xế trực tuyến (Driver Offline)](#tc13-không-có-tài-xế-trực-tuyến-driver-offline)
*   [TC14: Phương thức thanh toán không hợp lệ (Invalid Payment Method)](#tc14-phương-thức-thanh-toán-không-hợp-lệ-invalid-payment-method)
*   [TC15: Quãng đường quá ngắn (ETA với khoảng cách = 0)](#tc15-quãng-đường-quá-ngắn-eta-với-khoảng-cách--0)
*   [TC16: Tính toán giá nâng cao (Pricing Surge)](#tc16-tính-toán-giá-nâng-cao-pricing-surge)
*   [TC17: Gọi API chống gian lận (Fraud API)](#tc17-gọi-api-chống-gian-lận-fraud-api)
*   [TC18: Token bảo mật hết hạn (Token Expired)](#tc18-token-bảo-mật-hết-hạn-token-expired)
*   [TC19: Chống submit trùng lặp (Idempotency)](#tc19-chống-submit-trùng-lặp-idempotency)
*   [TC20: Tải trọng Request quá lớn (Payload Limit)](#tc20-tải-trọng-request-quá-lớn-payload-limit)

---

### Yêu Cầu Chung

Hầu hết các endpoints cần xác thực. Trừ khi được mô tả đặc biệt, bạn cần cung cấp Header sau:
```http
Authorization: Bearer <ACCESS_TOKEN>
```
*(Bạn có thể lấy `ACCESS_TOKEN` bằng cách đăng nhập qua API `POST /api/auth/login`)*

---

### TC11: Thiếu trường dữ liệu bắt buộc (Missing Field)

Kiểm tra xem hệ thống có bắt lỗi nếu payload thiếu thông tin điểm đón (`pickup`) hay không.

*   **Endpoint:** `POST /api/bookings`
*   **Payload (JSON):**
    ```json
    {
      "drop": { "lat": 10.77, "lng": 106.70 },
      "distance_km": 5
    }
    ```
*   **Kết quả mong đợi:** HTTP `400 Bad Request`
    ```json
    {
      "success": false,
      "message": "pickup is required"
    }
    ```

### TC12: Sai định dạng dữ liệu (Wrong Format)

Kiểm tra xem hệ thống có từ chối nếu tọa độ gửi lên không phải là kiểu số (number) hay không (ví dụ: chữ ký tự).

*   **Endpoint:** `POST /api/bookings`
*   **Payload (JSON):**
    ```json
    {
      "pickup": { "lat": "mười fake", "lng": 106.66 },
      "drop": { "lat": 10.77, "lng": 106.70 },
      "distance_km": 5
    }
    ```
*   **Kết quả mong đợi:** HTTP `422 Unprocessable Entity`
    ```json
    {
      "success": false,
      "message": "Invalid coordinate format: lat and lng must be numbers"
    }
    ```

### TC13: Không có tài xế trực tuyến (Driver Offline)

Kiểm tra kịch bản phân bổ cuốc xe nhưng không tìm thấy tài xế nào để nhận.

*   **Endpoint:** `POST /api/bookings/check-driver`
*   **Payload (JSON):**
    ```json
    {}
    ```
*   **Kết quả mong đợi:** HTTP `200 OK` (hoặc `404`) — Tùy theo logic API của bạn
    ```json
    {
      "success": false,
      "status": "FAILED",
      "message": "No drivers available"
    }
    ```

### TC14: Phương thức thanh toán không hợp lệ (Invalid Payment Method)

Đảm bảo người dùng phải chọn một phương thức thanh toán trong danh sách hợp lệ (`CREDIT_CARD`, `WALLET`, `CASH`).

*   **Endpoint:** `POST /api/payments`
*   **Payload (JSON):**
    ```json
    {
      "bookingId": "123e4567-e89b-12d3-a456-426614174000",
      "amount": 65000,
      "paymentMethod": "BITCOIN"
    }
    ```
*   **Kết quả mong đợi:** HTTP `400 Bad Request`
    ```json
    {
      "success": false,
      "message": "Invalid payment method"
    }
    ```

### TC15: Quãng đường quá ngắn (ETA với khoảng cách = 0)

Hệ thống phải xử lý an toàn (không bị crash hay chia cho 0) khi quãng đường truyền vào AI Service là 0 km.

*   **Endpoint:** `POST /api/eta`
*   **Payload (JSON):**
    ```json
    {
      "distance_km": 0,
      "traffic_level": 0.5
    }
    ```
*   **Kết quả mong đợi:** HTTP `200 OK`
    ```json
    {
      "eta": 0
    }
    ```

### TC16: Tính toán giá nâng cao (Pricing Surge)

Kiểm tra hệ số tính giá (Surge Pricing) thay đổi dựa trên cung cầu (số khách vs. số tài xế). Đồng thời hệ thống phải có cơ chế phòng ngừa chia cho 0.

*   **Endpoint:** `POST /api/pricing/calculate`
*   **Payload 1 (Sóng giá tăng cao):**
    ```json
    {
      "distance_km": 5,
      "demand_index": 3.0,
      "supply_index": 1.0
    }
    ```
    *Hiệu ứng: Giá dự kiến sẽ tăng gấp 3 (Surge = 3).*
*   **Payload 2 (Edge Case: supply = 0):**
    ```json
    {
      "distance_km": 5,
      "demand_index": 2.0,
      "supply_index": 0
    }
    ```
    *Hiệu ứng: Không bị crash, hệ thống tự động gán supply = 1 (hoặc số > 0).*

### TC17: Gọi API chống gian lận (Fraud API)

Gateway yêu cầu đầy đủ dữ liệu để tính toán rủi ro đơn hàng.

*   **Endpoint:** `POST /api/payment/fraud`
*   **Trường hợp 1 (Thiếu Fields):**
    Payload: `{ "user_id": "USR001" }`
    Kết quả: HTTP `400 Bad Request`, `message: "missing required fields"`
*   **Trường hợp 2 (Đầy đủ Fields, Giá trị bình thường):**
    ```json
    {
      "user_id": "USR001",
      "driver_id": "DRV001",
      "booking_id": "BK001",
      "amount": 65000
    }
    ```
    Kết quả: HTTP `200 OK`, `fraud_detected: false`

### TC18: Token bảo mật hết hạn (Token Expired)

Kiểm tra cấu hình Gateway yêu cầu từ chối một chuỗi token (JWT) đã vượt quá thời gian `exp`.

*   **Endpoint:** `GET /api/bookings`
*   **Headers:**
    ```http
    Authorization: Bearer <TỰ_TẠO_MỘT_TOKEN_EXPIRED>
    ```
*   **Kết quả mong đợi:** HTTP `401 Unauthorized`
    `error: "Token expired"` (Hệ thống Auto-Grader yêu cầu chữ `expired` có xuất hiện trong thông báo lỗi).

### TC19: Chống submit trùng lặp (Idempotency)

Bảo vệ service Đặt xe để khách hàng không lỡ tay nhấn "Đặt Xe" 2 lần và tạo ra 2 booking khác nhau liên tiếp.

*   **Endpoint:** `POST /api/bookings`
*   **Headers Cần Thiết:**
    ```http
    Idempotency-Key: abcxyz-random-1234
    ```
*   **Payload:** Gửi tọa độ bình thường như TC3.
*   **Kịch bản thực thi:**
    1.  Gửi Request Lần 1 → Hệ thống tạo mới và trả về `201 Created`.
    2.  Gửi **LẠI NGAY LẬP TỨC** Request Y Hệt Lần 1 (vẫn giữ nguyên `Idempotency-Key`) → Bắt buộc phải trả lại dữ liệu của booking cũ, với HTTP `200 OK`. `booking_id` phải giống nhau.

### TC20: Tải trọng Request quá lớn (Payload Limit)

Phòng chống tấn công chèn dữ liệu rác (Payload bomb).

*   **Endpoint:** Bất cứ API nào có body (VD: `POST /api/bookings`).
*   **Payload:** Gửi một file JSON chứa chuỗi string dài trên 1MB (Megabyte).
*   **Kết quả mong đợi:** HTTP `413 Payload Too Large`
    ```json
    {
      "success": false,
      "statusCode": 413,
      "message": "Payload too large",
      "errorCode": "SYS_002"
    }
    ```

---
**Tip:** Để chạy tự động toàn bộ bài kiểm tra Level 2 thông qua kịch bản tích hợp, mở Terminal và dùng lệnh:

```bash
npm run test:level2
```
Tất cả 10 bài kiểm thử phải qua 100% (Pass).
