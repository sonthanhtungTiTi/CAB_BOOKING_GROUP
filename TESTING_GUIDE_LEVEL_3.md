# 🚀 TESTING GUIDE - CAB BOOKING SYSTEM (LEVEL 3)

Tài liệu này hướng dẫn cách chạy và giải thích chi tiết 10 Test Cases Level 3 (TC21 - TC30) của hệ thống CAB. Level 3 tập trung vào **Integration (Tích hợp)** và **Resilience (Khả năng chịu lỗi)** giữa các microservices.

**Nguyên tắc tối thượng ở Level 3:** Sử dụng dữ liệu thật (Georadius thực tế), gọi API nội bộ bằng Axios thật, luồng Kafka thật, không dùng `Math.random()`, và hệ thống phải có cơ chế Retry & Fallback để không bao giờ Crash.

---

## 🛠️ 1. Chuẩn bị môi trường

Đảm bảo toàn bộ hạ tầng và các Microservices đều đang chạy:

```bash
# 1. Khởi động hạ tầng Docker (Postgres, Redis, MongoDB, Kafka, Zookeeper)
docker-compose up -d

# 2. Khởi động TẤT CẢ 11 microservices + API Gateway
npm run start:all
```

*Lưu ý: Bạn phải chờ Kafka consumer khởi tạo xong (khoảng 15-20s) trước khi chạy test, nếu không một số test về luồng event-driven có thể rớt do timeout.*

---

## 🧪 2. Chạy Test Suite Level 3

Bộ test Level 3 được tự động hóa hoàn toàn bằng `Jest` và `Supertest`, kết nối trực tiếp đến API Gateway (Port 3000).

```bash
npm run test:level3
```

Khi chạy thành công, kết quả terminal sẽ hiển thị 10/10 Test Cases đều PASS. Tất cả các test ở level 1, 2 và 3 cũng đã được cấu hình chạy tự động trên GitHub Actions (CI/CD).

---

## 📋 3. Chi tiết 10 Test Cases theo Cấu trúc Chuẩn (TC21 - TC30)

### TC21: Booking gọi AI Service để lấy ETA
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
	```json
	{
		"pickup": { "lat": 10.76, "lng": 106.66 },
		"drop": { "lat": 10.77, "lng": 106.70 },
		"distance_km": 10
	}
	```
* **Kết quả mong đợi:** HTTP `201 Created`, response có `eta > 0`
* **Ý nghĩa kết quả:** Xác nhận luồng gọi đồng bộ từ Booking sang AI hoạt động đúng trước khi hoàn tất tạo booking.

### TC22: Booking gọi Pricing Service để lấy giá
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
	```json
	{
		"pickup": { "lat": 10.76, "lng": 106.66 },
		"drop": { "lat": 10.77, "lng": 106.70 },
		"distance_km": 5
	}
	```
* **Kết quả mong đợi:** HTTP `201 Created`, response có `price > 0` và có trường `surge`
* **Ý nghĩa kết quả:** Chứng minh service pricing tích hợp tốt, dữ liệu giá trả về hợp lệ trong luồng đặt xe thật.

### TC23: Build AI Context từ dữ liệu thực tế
* **Endpoint:** `POST /api/ai/context`
* **Data JSON nhập vào để test:**
	```json
	{
		"ride_id": "test-ride-001",
		"pickupLat": 10.76,
		"pickupLng": 106.66,
		"destLat": 10.77,
		"destLng": 106.70,
		"distance_km": 5
	}
	```
* **Kết quả mong đợi:** HTTP `200 OK`, response đúng schema context (có `available_drivers`, `traffic_level`, `demand_index`, `supply_index`)
* **Ý nghĩa kết quả:** Đảm bảo AI dùng context thật (Redis geospatial + metadata chuyến đi), không dùng dữ liệu giả.

### TC24: End-to-End booking -> accept -> notification
* **Endpoint:**
	1. `POST /api/bookings`
	2. `PUT /api/bookings/:id/accept`
	3. `POST /api/notification/send`
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
		"driver_id": "<UUID hợp lệ>"
	}
	```
	```json
	{
		"user_id": "<user_id đã đăng nhập>",
		"message": "TC24 E2E test notification"
	}
	```
* **Kết quả mong đợi:** Chuỗi endpoint chạy thông suốt, notification trả `200` và `sent: true`
* **Ý nghĩa kết quả:** Xác nhận luồng tích hợp toàn vẹn xuyên service, event và notification không bị đứt.

### TC25: Publish sự kiện `ride_requested` khi tạo booking
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
	```json
	{
		"pickup": { "lat": 10.76, "lng": 106.66 },
		"drop": { "lat": 10.77, "lng": 106.70 },
		"distance_km": 5
	}
	```
* **Kết quả mong đợi:** HTTP `201 Created`, response có `booking_id` và `status: "REQUESTED"`
* **Ý nghĩa kết quả:** Cho thấy bước tạo booking đã kích hoạt đúng trạng thái và sẵn sàng phát sự kiện Kafka tương ứng.

### TC26: Notification xử lý luồng `ride_accepted`
* **Endpoint:**
	1. `POST /api/bookings`
	2. `PUT /api/bookings/:id/accept`
	3. `POST /api/notification/send`
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
		"driver_id": "<UUID hợp lệ>"
	}
	```
	```json
	{
		"user_id": "<driver_uuid>",
		"message": "Ride accepted confirmation"
	}
	```
* **Kết quả mong đợi:** Notification endpoint trả HTTP `200 OK`, body có `sent: true`
* **Ý nghĩa kết quả:** Xác nhận service thông báo đang sống và xử lý đúng sau sự kiện chấp nhận cuốc xe.

### TC27: Accept booking thành công
* **Endpoint:** `PUT /api/bookings/:id/accept`
* **Data JSON nhập vào để test:**
	```json
	{
		"driver_id": "<UUID hợp lệ>"
	}
	```
* **Kết quả mong đợi:** HTTP `200 OK`, response có `status: "ACCEPTED"`, `booking_id` đúng với booking đã tạo
* **Ý nghĩa kết quả:** Bảo đảm cập nhật trạng thái booking đúng nghiệp vụ và dữ liệu driver có kiểu hợp lệ.

### TC28: AI match chọn tài xế gần nhất (deterministic)
* **Endpoint:** `POST /api/ai/match`
* **Data JSON nhập vào để test:**
	```json
	{
		"ride_id": "test-ride-match",
		"pickupLat": 10.76,
		"pickupLng": 106.66,
		"destLat": 10.77,
		"destLng": 106.70,
		"distance_km": 5
	}
	```
* **Kết quả mong đợi:** HTTP `200 OK`, `selected_driver.driver_id = "DRV_NEAR"`
* **Ý nghĩa kết quả:** Khẳng định thuật toán chọn tài xế có tính xác định, ưu tiên tài xế gần nhất và không dùng random.

### TC29: Gateway proxy route booking chính xác
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
	```json
	{
		"pickup": { "lat": 10.76, "lng": 106.66 },
		"drop": { "lat": 10.77, "lng": 106.70 },
		"distance_km": 5
	}
	```
* **Kết quả mong đợi:** HTTP `2xx`, body có `booking_id`
* **Ý nghĩa kết quả:** Chứng minh API Gateway định tuyến đúng sang Booking Service, không lỗi route và không rớt middleware auth.

### TC30: Fallback khi Pricing timeout
* **Endpoint:** `POST /api/bookings`
* **Data JSON nhập vào để test:**
	```json
	{
		"pickup": { "lat": 10.76, "lng": 106.66 },
		"drop": { "lat": 10.77, "lng": 106.70 },
		"distance_km": 5,
		"simulate_timeout": true
	}
	```
* **Kết quả mong đợi:** HTTP `201 Created`, response vẫn có `booking_id`, `price > 0`, `surge = 1.0`
* **Ý nghĩa kết quả:** Xác nhận cơ chế chịu lỗi hoạt động đúng, Pricing timeout nhưng Booking vẫn trả kết quả an toàn thay vì crash.

---

## 🎯 Tổng kết Hành trình

1. **Level 1**: Chạy các luồng CRUD cơ bản và Unit Test cơ sở mạch lạc.
2. **Level 2**: Các Validation sâu, bảo mật xác thực (Auth/Idempotency), bám sát Edge cases.
3. **Level 3**: Hệ thống có khả năng tự động xử lý Failures cục bộ, Inter-service Communication chắc chắn, ứng dụng Kafka Event Stream và giải phóng tiềm lực của Event-Driven Architecture.

**CAB System chính thức đạt trạng thái Sẵn Sàng Vận Hành Cấp Độ Enterprise! 🚀**
