require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const http = require('http');
const app = require('./app');
const { initSocketServer } = require('./src/socket/socketHandler');

const PORT = parseInt(process.env.API_GATEWAY_PORT || '3000', 10);

// Tạo HTTP server thay vì app.listen(),
// để cùng share port cho cả REST API và WebSocket.
const server = http.createServer(app);

// Gắn Socket.io vào HTTP server
const io = initSocketServer(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Gateway is running on http://127.0.0.1:${PORT}/api`);
  console.log(`🔌 WebSocket (Socket.io) listening on ws://127.0.0.1:${PORT}/drivers`);
});
