import React, { useState, useEffect } from 'react';
import useAuthStore from '../store/authStore';
import socketManager from '../lib/socketClient';

const DevTools = () => {
  const { user, isAuthenticated } = useAuthStore();
  
  const [notifyConnected, setNotifyConnected] = useState(false);
  const [driverConnected, setDriverConnected] = useState(false);
  
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Polling 1s/lần để check trạng thái socket (chỉ cho devtools hiển thị)
    const interval = setInterval(() => {
      setNotifyConnected(socketManager.notifySocket?.connected || false);
      setDriverConnected(socketManager.driverSocket?.connected || false);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTestPing = () => {
    if (socketManager.notifySocket?.connected) {
      console.log('%c[🛠️ DevTools] Emitting ping...', 'color: #10b981;');
      socketManager.notifySocket.emit('ping', { test: true });
    } else {
      console.warn('[🛠️ DevTools] NotifySocket is not connected');
    }
  };

  if (process.env.NODE_ENV === 'production' || !isAuthenticated) {
    return null; // Không hiện khi chưa login hoặc trên prod
  }

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] bg-black text-emerald-400 border border-emerald-500/50 px-3 py-2 rounded shadow-2xl font-mono text-xs opacity-70 hover:opacity-100 transition-opacity"
      >
        🛠️ DevTools
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-72 bg-black border border-emerald-500/50 p-4 rounded shadow-2xl font-mono text-xs text-emerald-400">
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-emerald-500/30">
        <h4 className="font-bold">CAB Diagnostic</h4>
        <button onClick={() => setIsOpen(false)} className="text-emerald-600 hover:text-emerald-400">
          [X]
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <span className="text-emerald-600">User:</span> {user?.email}
        </div>
        <div>
          <span className="text-emerald-600">Role:</span> <span className="bg-emerald-900/50 px-1 rounded uppercase">{user?.role}</span>
        </div>

        <div className="pt-2 border-t border-emerald-500/30">
          <div className="flex justify-between items-center">
            <span>Notify Socket:</span>
            <span className="flex items-center gap-1">
              {notifyConnected ? 'Connected' : 'Offline'}
              <div className={`w-2 h-2 rounded-full ${notifyConnected ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-red-500'}`}></div>
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span>Driver Socket:</span>
            <span className="flex items-center gap-1">
              {driverConnected ? 'Connected' : 'Offline'}
              <div className={`w-2 h-2 rounded-full ${driverConnected ? 'bg-emerald-500 shadow-[0_0_5px_#10b981]' : 'bg-red-500'}`}></div>
            </span>
          </div>
        </div>

        <div className="pt-2 mt-2">
          <button 
            onClick={handleTestPing}
            className="w-full bg-emerald-900/50 hover:bg-emerald-800 text-emerald-300 py-1.5 border border-emerald-700 rounded transition-colors"
          >
            🔥 Test Socket Ping
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevTools;
