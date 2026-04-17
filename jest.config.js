/** @type {import('jest').Config} */
module.exports = {
  // Chạy test tuần tự (không song song) — bắt buộc cho integration tests
  // vì các TC phụ thuộc dữ liệu lẫn nhau (token từ TC2 → TC3)
  maxWorkers: 1,

  // Timeout dài hơn mặc định (30s) vì integration test cần gọi HTTP tới services
  testTimeout: 30000,

  // Chỉ tìm file test trong thư mục __tests__/
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],

  // Không cần transform (pure Node.js, không TS/JSX)
  transform: {},

  // Verbose output — hiển thị tên từng test case
  verbose: true,
};
