import { useNavigate } from 'react-router-dom';
import authStore from '../../store/authStore';
import { LogOut, LayoutDashboard } from 'lucide-react';
import DriverDashboard from './DriverDashboard';
import CustomerDashboard from './CustomerDashboard';

const Dashboard = () => {
  const user = authStore((state) => state.user);
  const logout = authStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isDriver = user?.role === 'DRIVER';

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-slate-800 border-b border-slate-700 py-3 px-6 md:px-8 flex items-center justify-between shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDriver ? 'bg-amber-500/20' : 'bg-blue-500/20'}`}>
            <LayoutDashboard className={`w-6 h-6 ${isDriver ? 'text-amber-400' : 'text-blue-400'}`} />
          </div>
          <div>
            <span className="text-white text-xl font-bold tracking-tight block leading-tight">CAB Control</span>
            <span className="text-xs text-slate-400 font-medium tracking-widest uppercase">{user?.role}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-slate-300 text-sm hidden md:block">
            {user?.email}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-red-400 hover:text-white bg-red-400/10 hover:bg-red-500 px-4 py-2 rounded-lg transition-colors font-semibold text-sm border border-red-500/20 hover:border-red-500"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Payload Switcher */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 md:px-8 py-8">
        {user?.role === 'DRIVER' ? (
          <DriverDashboard />
        ) : (
          <CustomerDashboard />
        )}
      </main>
    </div>
  );
};

export default Dashboard;
