const promClient = require('prom-client');

// Khởi tạo register
const register = new promClient.Registry();

// Lấy default metrics của Node.js (CPU, GC, memory)
promClient.collectDefaultMetrics({ register });

// Tạo Metric đo thời gian xử lý request (Histogram)
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10], // Buckets theo giây
});

register.registerMetric(httpRequestDurationMicroseconds);

// Middleware theo dõi
const metricsMiddleware = (req, res, next) => {
  // Tránh theo dõi route /metrics
  if (req.path === '/metrics') {
    return next();
  }

  const end = httpRequestDurationMicroseconds.startTimer();
  
  res.on('finish', () => {
    // Phân loại route đơn giản (gom nhóm các ID lại với nhau nếu muốn tối ưu hơn)
    let route = req.route ? req.route.path : req.path;
    end({ 
      method: req.method, 
      route: route, 
      status_code: res.statusCode 
    });
  });

  next();
};

module.exports = {
  register,
  metricsMiddleware,
};
