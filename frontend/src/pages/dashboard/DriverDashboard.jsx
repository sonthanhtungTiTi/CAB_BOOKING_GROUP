import React, { useState, useEffect } from 'react';
import MapViewer from '../../components/Map/MapViewer';
import socketManager from '../../lib/socketClient';
import axiosClient from '../../lib/axiosClient';
import { toast } from 'react-toastify';
import { Power, MapPin, Navigation, CheckCircle } from 'lucide-react';

const DriverDashboard = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState(null);
  const [watchId, setWatchId] = useState(null);

  // Lưu thông tin cuốc xe đang nhận
  const [activeBookingId, setActiveBookingId] = useState(null);
  const [rideStatus, setRideStatus] = useState('IDLE'); // IDLE -> PICKUP -> IN_PROGRESS -> COMPLETED

  useEffect(() => {
    // ── Phục hồi trạng thái khi F5 (Session Recovery) ──────────
    const restoreSession = async () => {
      try {
        const res = await axiosClient.get('/bookings/current');
        const booking = res.data;
        if (booking && booking.id) {
          const activeRideStatuses = ['ASSIGNED', 'PICKUP', 'IN_PROGRESS'];
          if (activeRideStatuses.includes(booking.status)) {
            setActiveBookingId(booking.id);
            setRideStatus(booking.status);
            setIsOnline(true);
            toast.info('🔄 Đã khôi phục chuyến đi hiện tại!', { theme: 'dark' });
          }
        }
      } catch (err) {
        // Silent — Không có chuyến nào đang active
      }
    };
    restoreSession();

    // 1. Tài xế cần lắng nghe thông báo từ hệ thống
    const notifySocket = socketManager.connectNotify();

    if (notifySocket) {
      notifySocket.on('notification', (payload) => {
        console.log('Driver received notification:', payload);
        const msg = payload.message || '';

        // Bắt sự kiện có cuốc xe mới
        if (msg.includes('cuốc xe mới') || msg.includes('gán cuốc')) {
          toast.success(`🚖 ${msg}`, { autoClose: false });
          const bId = payload.data?.bookingId;
          if (bId) {
            setActiveBookingId(bId);
            setRideStatus('ASSIGNED');
          }
        } else {
          toast.info(`🔔 ${msg}`);
        }
      });
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      socketManager.disconnectAll();
    };
  }, [watchId]);

  // Bộ phát Tọa độ Định kỳ (Heartbeat) - Đảm bảo tài xế luôn ở trong Redis
  useEffect(() => {
    if (!isOnline || !location) return;

    const interval = setInterval(() => {
      const driverSocket = socketManager.connectDriver();
      if (driverSocket && driverSocket.connected) {
        console.log('[Heartbeat] Sending explicit location:', location);
        driverSocket.emit('driver:update_location', location);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOnline, location]);

  const toggleOnline = () => {
    if (isOnline) {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }
      setIsOnline(false);
      toast.info('Tài xế đã Offline');
    } else {
      if (!('geolocation' in navigator)) {
        return toast.error('Trình duyệt không hỗ trợ GPS');
      }

      const mLat = 10.762622 + (Math.random() - 0.5) * 0.01;
      const mLng = 106.660172 + (Math.random() - 0.5) * 0.01;

      // Xử lý cứng (Mock) vì Trình duyệt hay chặn GPS ngầm định
      setLocation({ lat: mLat, lng: mLng });
      const driverSocket = socketManager.connectDriver();
      if (driverSocket) {
        if (driverSocket.connected) {
          driverSocket.emit('driver:update_location', { lat: mLat, lng: mLng });
        } else {
          driverSocket.once('connect', () => {
            driverSocket.emit('driver:update_location', { lat: mLat, lng: mLng });
          });
        }
      }

      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ lat: latitude, lng: longitude });

          if (driverSocket) {
            if (driverSocket.connected) {
              driverSocket.emit('driver:update_location', { lat: latitude, lng: longitude });
            }
          }
        },
        (error) => {
          console.error('Lỗi GPS ngầm (có thể do Tab bị ẩn):', error);
          // Không được tắt isOnline ở đây vì màn hình ẩn danh/background hay văng lỗi GPS giả
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );

      setWatchId(id);
      setIsOnline(true);
      toast.success('Đã Online! Hệ thống đang phát GPS.');
    }
  };

  // Hàm gọi API Cập nhật trạng thái chuyến đi
  const updateRideStatus = async (newStatus) => {
    try {
      if (!activeBookingId) return;

      await axiosClient.put(`/rides/${activeBookingId}/status`, {
        status: newStatus
      });

      setRideStatus(newStatus);
      toast.success(`Đã cập nhật trạng thái: ${newStatus}`);

      // Nếu hoàn thành chuyến, xóa phiên cuốc xe
      if (newStatus === 'COMPLETED') {
        setActiveBookingId(null);
        setRideStatus('IDLE');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Cập nhật thất bại!');
    }
  };

  const mapCenter = location ? [location.lat, location.lng] : [10.762622, 106.660172];
  const markers = location ? [location] : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Panel Trái */}
      <div className="lg:col-span-1 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col items-center">

        {/* NẾU KHÔNG CÓ CUỐC XE -> Hiện nút ONLINE/OFFLINE */}
        {!activeBookingId ? (
          <>
            <h3 className="text-xl font-semibold text-white mb-6">Trạng thái</h3>
            <button
              onClick={toggleOnline}
              className={`relative overflow-hidden w-40 h-40 rounded-full flex flex-col items-center justify-center gap-2 font-bold text-lg shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 ${isOnline
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-500/50 outline outline-4 outline-emerald-500/30'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 outline outline-4 outline-slate-600/50'
                }`}
            >
              <Power className={`w-12 h-12 ${isOnline ? 'animate-pulse' : ''}`} />
              {isOnline ? 'ONLINE' : 'GO ONLINE'}
            </button>
            <p className="mt-6 text-slate-400 text-sm text-center">
              {isOnline ? 'Đang chờ hệ thống ghép cuốc...' : 'Bật Online để bắt đầu nhận chuyến.'}
            </p>
          </>
        ) : (
          /* NẾU CÓ CUỐC XE -> Hiện BẢNG ĐIỀU KHIỂN CHUYẾN ĐI */
          <div className="w-full flex flex-col h-full">
            <div className="bg-amber-500/20 border border-amber-500/50 p-4 rounded-lg mb-6 text-center text-amber-400">
              <h4 className="font-bold text-lg">ĐANG TRONG CHUYẾN ĐI</h4>
              <p className="text-xs mt-1 text-amber-200 opacity-70">Booking ID: {activeBookingId.substring(0, 8)}...</p>
            </div>

            <div className="space-y-4 flex-1">
              {rideStatus === 'ASSIGNED' && (
                <button
                  onClick={() => updateRideStatus('PICKUP')}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2"
                >
                  <Navigation className="w-5 h-5" /> Đã tới điểm đón
                </button>
              )}

              {rideStatus === 'PICKUP' && (
                <button
                  onClick={() => updateRideStatus('IN_PROGRESS')}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2"
                >
                  <Navigation className="w-5 h-5" /> Đã đón khách (Bắt đầu)
                </button>
              )}

              {rideStatus === 'IN_PROGRESS' && (
                <button
                  onClick={() => updateRideStatus('COMPLETED')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> Hoàn thành chuyến
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tọa độ hiện tại */}
        {location && (
          <div className="mt-6 bg-slate-900 w-full p-4 rounded-lg flex items-center justify-between border border-slate-700">
            <div className="flex items-center gap-3">
              <MapPin className="text-emerald-400 w-5 h-5" />
              <div className="text-left">
                <p className="text-xs text-slate-500 uppercase font-semibold">Tọa độ GPS</p>
                <p className="text-sm text-slate-300 font-mono">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </p>
              </div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
        )}
      </div>

      {/* Bản đồ */}
      <div className="lg:col-span-3 bg-slate-800 rounded-xl border border-slate-700 shadow-xl h-[600px] overflow-hidden p-2 relative">
        <MapViewer center={mapCenter} markers={markers} />
        {!isOnline && !activeBookingId && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg m-2">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 text-center max-w-sm">
              <MapPin className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <h4 className="text-white font-medium text-lg mb-2">Bản đồ đang Offline</h4>
              <p className="text-slate-400 text-sm">Bật Online để bắt đầu gửi vị trí.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverDashboard;