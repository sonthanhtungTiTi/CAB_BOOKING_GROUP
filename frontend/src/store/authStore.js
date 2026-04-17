import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const authStore = create(devtools((set) => ({
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  
  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    console.log('%c[📦 Zustand] setAuth', 'color: #0ea5e9; font-weight: bold;', { user });
    set({ user, token, isAuthenticated: true }, false, 'auth/setAuth');
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    console.log('%c[📦 Zustand] logout', 'color: #ef4444; font-weight: bold;');
    set({ user: null, token: null, isAuthenticated: false }, false, 'auth/logout');
  }
})));

export default authStore;
