import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import authStore from './store/authStore';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/dashboard/Dashboard';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import DevTools from './components/DevTools';

const GuardRoute = ({ children }) => {
  const isAuthenticated = authStore((state) => state.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const isAuthenticated = authStore((state) => state.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        <Route path="/login" element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        } />
        
        <Route path="/register" element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        } />
        
        <Route path="/dashboard" element={
          <GuardRoute>
            <Dashboard />
          </GuardRoute>
        } />
      </Routes>
      <DevTools />
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />
    </Router>
  );
}

export default App;
