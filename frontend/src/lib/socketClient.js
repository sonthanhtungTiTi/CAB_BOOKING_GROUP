import { io } from 'socket.io-client';

class SocketManager {
  constructor() {
    this.SOCKET_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:3000';
    this.notifySocket = null;
    this.driverSocket = null;
  }

  // Khởi tạo kết nối nhánh Nhận Thông Báo (Dành cho CẢ HAI)
  connectNotify() {
    const token = localStorage.getItem('token');
    if (!token) return null;

    if (!this.notifySocket) {
      this.notifySocket = io(`${this.SOCKET_URL}/notifications`, {
        auth: { token },
        transports: ['websocket'],
      });

      this.notifySocket.on('connect', () => console.log('[Socket] Connected to /notifications'));
      this.notifySocket.on('connect_error', (err) => {
        console.error('[Socket] Error /notifications:', err.message);
        if (err.message.includes('jwt expired')) {
          localStorage.clear();
          window.location.href = '/login';
        }
      });

      // [Diagnostic Logger] Bắt mọi event của Notify
      this.notifySocket.onAny((event, ...args) => console.log('%c[⚡ Socket NOTIFY]', 'color: #f59e0b; font-weight: bold', event, args));
    }
    return this.notifySocket;
  }

  // Khởi tạo kết nối nhánh GPS (Dành RIÊNG cho TÀI XẾ)
  connectDriver() {
    const token = localStorage.getItem('token');
    if (!token) return null;

    if (!this.driverSocket) {
      this.driverSocket = io(`${this.SOCKET_URL}/drivers`, {
        auth: { token },
        transports: ['websocket'],
      });

      this.driverSocket.on('connect', () => console.log('[Socket] Connected to /drivers'));
      this.driverSocket.on('connect_error', (err) => {
        console.error('[Socket] Error /drivers:', err.message);
        if (err.message.includes('jwt expired')) {
          localStorage.clear();
          window.location.href = '/login';
        }
      });

      // [Diagnostic Logger] Bắt mọi event của Driver
      this.driverSocket.onAny((event, ...args) => console.log('%c[⚡ Socket DRIVER]', 'color: #8b5cf6; font-weight: bold', event, args));
    }
    return this.driverSocket;
  }

  // Ngắt tất cả kết nối khi Logout
  disconnectAll() {
    if (this.notifySocket) {
      this.notifySocket.disconnect();
      this.notifySocket = null;
    }
    if (this.driverSocket) {
      this.driverSocket.disconnect();
      this.driverSocket = null;
    }
  }
}

export default new SocketManager();