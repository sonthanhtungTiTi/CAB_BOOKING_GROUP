import React, { useState, useEffect } from 'react';
import MapViewer from '../../components/Map/MapViewer';
import socketManager from '../../lib/socketClient';
import axiosClient from '../../lib/axiosClient';
import { toast } from 'react-toastify';
import { CarFront, MapPin, Bell, Loader2, CreditCard, CheckCircle2, Search } from 'lucide-react';
import axios from 'axios';

const CustomerDashboard = () => {
  // Trạng thái chuyến đi: IDLE -> SEARCHING -> ASSIGNED -> IN_PROGRESS -> COMPLETED
  const [rideStatus, setRideStatus] = useState('IDLE');
  const [bookingData, setBookingData] = useState(null);
  const [amount, setAmount] = useState(0);

  // Tọa độ (Điểm đón mặc định: TP.HCM)
  const [pickup, setPickup] = useState({ lat: 10.762622, lng: 106.660172 });
  const [destination, setDestination] = useState(null);
  const [destinationName, setDestinationName] = useState('');

  // OpenStreetMap Address Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    // ── Phục hồi trạng thái khi F5 (Session Recovery) ──────────
    const restoreSession = async () => {
      try {
        const res = await axiosClient.get('/bookings/current');
        const booking = res.data;
        if (booking && booking.id) {
          setBookingData(booking);
          setRideStatus(booking.status);
          if (booking.destinationLat && booking.destinationLng) {
            setDestination({ lat: booking.destinationLat, lng: booking.destinationLng });
          }
          toast.info('🔄 Đã khôi phục chuyến đi hiện tại!', { theme: 'dark' });
        }
      } catch (err) {
        // Silent — Không có chuyến nào đang active, giữ IDLE
      }
    };
    restoreSession();

    // 1. Chỉ kết nối ống Notifications cho Khách hàng
    const socket = socketManager.connectNotify();

    if (socket) {
      socket.on('notification', (payload) => {
        console.log('Customer received notification:', payload);
        const msg = payload.message || '';

        toast.info(`🔔 ${msg}`, { position: "top-center", autoClose: 5000, theme: "dark" });

        // Dựa vào text thông báo từ Backend để đổi trạng thái UI
        const lowerMsg = msg.toLowerCase();
        if (lowerMsg.includes('tìm thấy tài xế')) {
          setRideStatus('ASSIGNED');
        } else if (lowerMsg.includes('hoàn thành') || lowerMsg.includes('priced')) {
          setRideStatus('COMPLETED');
          // Lấy số tiền THỰC TẾ từ Pricing Service qua payload
          const realAmount = payload.data?.totalAmount || 0;
          setAmount(realAmount);
        } else if (lowerMsg.includes('thanh toán thành công')) {
          setRideStatus('PAID');
        }
      });
    }

    return () => {
      socketManager.disconnectAll();
    };
  }, []);

  // ── Tìm kiếm địa chỉ qua OpenStreetMap Nominatim ──────────
  const searchAddress = async () => {
    if (!searchQuery.trim()) {
      return toast.error('Vui lòng nhập địa chỉ điểm đến!');
    }

    setIsSearching(true);
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          format: 'json',
          q: searchQuery,
          countrycodes: 'vn',
          limit: 1,
        },
        headers: {
          'Accept-Language': 'vi',
        },
      });

      if (res.data && res.data.length > 0) {
        const place = res.data[0];
        setDestination({
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
        });
        setDestinationName(place.display_name.split(',').slice(0, 3).join(', '));
        toast.success(`📍 Đã chọn: ${place.display_name.split(',').slice(0, 2).join(', ')}`);
      } else {
        toast.error('Không tìm thấy địa chỉ này. Thử nhập cụ thể hơn.');
      }
    } catch (err) {
      console.error('OSM search error:', err);
      toast.error('Lỗi khi tìm kiếm địa chỉ!');
    } finally {
      setIsSearching(false);
    }
  };

  // Nút Đặt Xe
  const handleBookRide = async () => {
    if (!destination) {
      return toast.error('Vui lòng chọn điểm đến!');
    }

    setRideStatus('SEARCHING');
    try {
      // Tạo Idempotency-Key chống spam
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();

      const res = await axiosClient.post('/bookings', {
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        destLat: destination.lat,
        destLng: destination.lng
      }, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      setBookingData(res.data.data || res.data);
      toast.success('Đã gửi yêu cầu đặt xe! Đang tìm tài xế...');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Lỗi khi đặt xe!');
      setRideStatus('IDLE');
    }
  };

  // Nút Thanh toán
  const handlePayment = async () => {
    try {
      if (!bookingData?.id) {
        return toast.error('Không tìm thấy thông tin chuyến đi!');
      }

      await axiosClient.post('/payments', {
        bookingId: bookingData.id,
        amount: amount,
        paymentMethod: 'wallet'
      });

      // Status 'PAID' sẽ được set qua Socket khi nhận biên lai
      toast.success('Đang xử lý thanh toán...');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Thanh toán thất bại!');
    }
  };

  // Reset về ban đầu
  const resetRide = () => {
    setRideStatus('IDLE');
    setBookingData(null);
    setDestination(null);
    setDestinationName('');
    setSearchQuery('');
  };

  const markers = [pickup];
  if (destination) markers.push(destination);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Panel Trái */}
      <div className="lg:col-span-1 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col">
        <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-4">Đặt Xe</h3>

        <div className="space-y-4 flex-1">
          <div className="relative">
            <div className="absolute top-3 left-3 w-3 h-3 bg-emerald-500 rounded-full"></div>
            <input
              type="text"
              readOnly
              value="Vị trí của bạn (TP.HCM)"
              className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
            />
          </div>

          {/* Ô tìm kiếm điểm đến bằng OpenStreetMap */}
          <div className="relative">
            <div className="absolute top-3 left-3 w-3 h-3 bg-blue-500 rounded-none"></div>
            {rideStatus === 'IDLE' ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nhập địa chỉ điểm đến..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchAddress()}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-colors"
                />
                <button
                  onClick={searchAddress}
                  disabled={isSearching}
                  className="px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <input
                type="text"
                readOnly
                value={destinationName || (destination ? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}` : 'Chưa chọn điểm đến')}
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white"
              />
            )}
          </div>

          {/* Hiển thị tên điểm đến đã chọn */}
          {destination && rideStatus === 'IDLE' && destinationName && (
            <p className="text-xs text-emerald-400 px-2">📍 {destinationName}</p>
          )}

          {/* HIỂN THỊ THEO TRẠNG THÁI */}
          <div className="mt-8">
            {rideStatus === 'IDLE' && (
              <button
                onClick={handleBookRide}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95"
              >
                <CarFront className="w-5 h-5" /> Book Ride
              </button>
            )}

            {rideStatus === 'SEARCHING' && (
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
                <p className="text-blue-400 font-medium">Hệ thống AI đang tìm tài xế...</p>
              </div>
            )}

            {(rideStatus === 'ASSIGNED' || rideStatus === 'PICKUP' || rideStatus === 'IN_PROGRESS') && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg">
                <p className="text-emerald-400 font-bold flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5" /> Đã ghép tài xế!
                </p>
                <p className="text-sm text-slate-300">
                  {rideStatus === 'ASSIGNED' && 'Tài xế đang trên đường đến điểm đón.'}
                  {rideStatus === 'PICKUP' && 'Tài xế đã tới điểm đón. Vui lòng lên xe.'}
                  {rideStatus === 'IN_PROGRESS' && 'Đang trong chuyến đi...'}
                </p>
              </div>
            )}

            {rideStatus === 'COMPLETED' && (
              <div className="bg-slate-900 border border-amber-500/30 p-4 rounded-lg flex flex-col gap-4">
                <div className="text-center">
                  <p className="text-slate-400 text-sm">Chuyến đi hoàn thành</p>
                  <p className="text-3xl font-bold text-amber-400 mt-1">
                    {amount.toLocaleString('vi-VN')} đ
                  </p>
                </div>
                <button
                  onClick={handlePayment}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" /> Thanh Toán
                </button>
              </div>
            )}

            {rideStatus === 'PAID' && (
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <p className="text-white font-bold mb-4">Cảm ơn bạn đã trải nghiệm!</p>
                <button
                  onClick={resetRide}
                  className="bg-slate-700 text-white px-4 py-2 rounded shadow hover:bg-slate-600"
                >
                  Đặt chuyến mới
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bản đồ */}
      <div className="lg:col-span-3 bg-slate-800 rounded-xl border border-slate-700 shadow-xl h-[600px] overflow-hidden p-2">
        <MapViewer center={[pickup.lat, pickup.lng]} markers={markers} />
      </div>
    </div>
  );
};

export default CustomerDashboard;