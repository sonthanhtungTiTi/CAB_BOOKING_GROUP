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

## 📋 3. Chi tiết 10 Test Cases (TC21 - TC30)

### 📌 Giao tiếp đồng bộ (Synchronous Calls)
**🔥 TC21: Booking Service gọi đồng bộ AI Service lấy ETA**
- **Action**: Gửi `POST /api/bookings` tạo chuyến đi.
- **Mong đợi**: Trước khi lưu Database, Booking Service gọi `axios` sang AI Service (Port 4010). API trả về `201 Created` và trong body có thuộc tính `eta > 0`.
- **Thực tế implemented**: AI tính ETA trơn tru qua công thức khoảng cách và mức độ giao thông.

**🔥 TC22: Booking Service gọi đồng bộ Pricing Service lấy Price**
- **Action**: Gửi `POST /api/bookings`.
- **Mong đợi**: Booking Service gọi `axios` sang Pricing Service (Port 4006) để lấy giá trả về cho khách. Body chứa `price > 0` và `surge`.
- **Thực tế implemented**: Giải quyết được lỗi response wrap 2 lớp `.data.data` do Middleware của gateway/pricing.

### 📌 Thu thập Context & AI Logic
**🔥 TC23: Build AI Context thực tế (Thu thập thông tin chuyến đi)**
- **Action**: `POST /api/ai/context`.
- **Mong đợi**: System quét Redis qua tập lệnh `GEORADIUS` lấy danh sách Driver đang trực quanh điểm đón.
- **Thực tế implemented**: Không Fake data, không tạo mảng rỗng, lấy chính xác schema `{ ride_id, pickup, drop, available_drivers, traffic_level, demand_index, supply_index }`.

**🔥 TC28: AI Agent chọn tài xế Deterministic**
- **Action**: `POST /api/ai/match`.
- **Mong đợi**: Agent duyệt qua `available_drivers` và trả về `driver_id` có `distance_km` thấp nhất. Tuyệt đối chặn `Math.random()`.
- **Thực tế implemented**: Logic sắp xếp chặt chẽ và test được verify bằng việc bơm 3 giả lập Redis tọa độ gần - vừa - xa rồi assertion.

### 📌 Nhắn tin bất đồng bộ (Kafka Event-Driven)
**🔥 TC25: Khởi tạo luồng Kafka `ride_requested`**
- **Action**: Khách hàng tạo Booking (`POST /api/bookings`).
- **Mong đợi**: Hệ thống Produce message lên Topic Kafka `ride_events` với `event_type: "ride_requested"`.

**🔥 TC27: API Accept Booking (Cập nhật DB & Bắn Kafka)**
- **Action**: Driver nhấn chấp nhận thông qua API `PUT /api/bookings/:id/accept`.
- **Mong đợi**: Trạng thái DB cập nhật thành `ACCEPTED`, gán `driver_id` (sử dụng UUID chuẩn), và Produce message lên Topic `ride_events` với `event_type: "ride_accepted"`.

**🔥 TC26: Notification Service thực thi bắn tin nhắn từ `ride_accepted`**
- **Mong đợi**: Notification Consumer (Port 4008) lắng nghe trên topic `ride_events`, khi nhận event subtype `ride_accepted` sẽ sinh lệnh mô phỏng push notification xuống app của Driver.
- **Thực tế implemented**: Đã log ra màn terminal quá trình Notification xử lý event hợp lý. Tham chiếu log `[NotifConsumer] Notification sent to driver <uuid>`.

**🔥 TC24: End-to-End Trôi Chảy (Luồng Event Toàn Vẹn)**
- **Mong đợi**: 1 lượt gọi API Booking -> Accept -> Event truyền Kafka -> Consumer xử lý độc lập đều không bị ngắt/blocking. Flow liên tục Payment & Node được kích hoạt mà không làm giảm performance của API chính.
- **Thực tế implemented**: Supertest giả lập timeout/khựng delay bằng `await new Promise(...)` rồi gọi thử verify logic E2E.

### 📌 Định tuyến (Gateway Routing)
**🔥 TC29: API Gateway Proxy**
- **Action**: Clients gọi `POST /api/bookings` ở cổng ngoài `3000`.
- **Mong đợi**: Request ngầm định tuyến trỏ đúng về cụm `Booking Service` thông qua xác thực Token JWT Middleware và Header (`x-user-id` forwarding). Không gặp lỗi Route Not Found.

### 📌 Khả năng chịu lỗi (Resilience / Fallback)
**🔥 TC30: Fallback logic khi Pricing Service sụp/timeout**
- **Action**: Gửi `POST /api/bookings` với cờ giả lập `simulate_timeout: true`.
- **Mong đợi**: Logic Pricing cố ý Thread Sleep 4 giây. Axios Booking config timeout 2 giây. Hết Retry 1 lần, Booking Service **KHÔNG ĐƯỢC CRASH 500**. Nó phải bật phương án dự phòng (Fallback): Tính giá nhanh bằng `15000 * distance_km`. Booking Code trả về 201 Created cùng giá `price` an toàn.
- **Thực tế implemented**: Xử lý triệt để đai an toàn `try-catch` kèm fallback value. Log rõ ràng quá trình fallback.

---

## 🎯 Tổng kết Hành trình

1. **Level 1**: Chạy các luồng CRUD cơ bản và Unit Test cơ sở mạch lạc.
2. **Level 2**: Các Validation sâu, bảo mật xác thực (Auth/Idempotency), bám sát Edge cases.
3. **Level 3**: Hệ thống có khả năng tự động xử lý Failures cục bộ, Inter-service Communication chắc chắn, ứng dụng Kafka Event Stream và giải phóng tiềm lực của Event-Driven Architecture.

**CAB System chính thức đạt trạng thái Sẵn Sàng Vận Hành Cấp Độ Enterprise! 🚀**
