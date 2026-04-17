import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosClient from '../../lib/axiosClient';
import authStore from '../../store/authStore';
import { toast } from 'react-toastify';
import { UserPlus, Mail, Lock, CheckCircle2 } from 'lucide-react';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CUSTOMER');
  const [isLoading, setIsLoading] = useState(false);
  
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);

  const handleRegister = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await axiosClient.post('/auth/register', { email, password, role });
      const { user, tokens } = response.data;
      setAuth(user, tokens.accessToken);
      toast.success('Registration completed successfully!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="mx-auto bg-emerald-500 w-16 h-16 flex items-center justify-center rounded-full mb-4 shadow-lg shadow-emerald-500/30">
              <UserPlus className="text-white w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Create Account</h2>
            <p className="text-slate-400 mt-2">Join the CAB network today</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                placeholder="Email address"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                placeholder="Secure Password"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-400 block">Select Account Type</label>
              <div className="grid grid-cols-2 gap-4">
                <label className={`relative flex cursor-pointer rounded-lg border p-4 transition-all ${role === 'CUSTOMER' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}>
                  <input type="radio" className="sr-only" name="role" value="CUSTOMER" checked={role === 'CUSTOMER'} onChange={() => setRole('CUSTOMER')} />
                  <div className="flex w-full items-center justify-between">
                    <div className="flex flex-col">
                      <span className={`block text-sm font-medium ${role === 'CUSTOMER' ? 'text-emerald-400' : 'text-slate-300'}`}>Customer</span>
                      <span className="mt-1 flex items-center text-xs text-slate-500">Book rides</span>
                    </div>
                    {role === 'CUSTOMER' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  </div>
                </label>
                
                <label className={`relative flex cursor-pointer rounded-lg border p-4 transition-all ${role === 'DRIVER' ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}>
                  <input type="radio" className="sr-only" name="role" value="DRIVER" checked={role === 'DRIVER'} onChange={() => setRole('DRIVER')} />
                  <div className="flex w-full items-center justify-between">
                    <div className="flex flex-col">
                      <span className={`block text-sm font-medium ${role === 'DRIVER' ? 'text-emerald-400' : 'text-slate-300'}`}>Driver</span>
                      <span className="mt-1 flex items-center text-xs text-slate-500">Earn money</span>
                    </div>
                    {role === 'DRIVER' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                  </div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          <p className="text-center mt-6 text-slate-400">
            Already a member?{' '}
            <Link to="/login" className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors">
              Sign in Instead
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
