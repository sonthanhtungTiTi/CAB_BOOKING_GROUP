import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosClient from '../../lib/axiosClient';
import authStore from '../../store/authStore';
import { toast } from 'react-toastify';
import { Car, Lock, Mail } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = authStore((state) => state.setAuth);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await axiosClient.post('/auth/login', { email, password });
      const { user, tokens } = response.data;
      setAuth(user, tokens.accessToken);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message || 'Login failed, please check your credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="mx-auto bg-blue-500 w-16 h-16 flex items-center justify-center rounded-full mb-4 shadow-lg shadow-blue-500/30">
              <Car className="text-white w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h2>
            <p className="text-slate-400 mt-2">Sign in to your CAB account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
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
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center mt-6 text-slate-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-400 font-medium hover:text-blue-300 transition-colors">
              Sign up now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
