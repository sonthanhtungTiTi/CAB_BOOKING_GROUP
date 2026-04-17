import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:3000') + '/api';

const axiosClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    // [Diagnostic Logger] Bắt bệnh request
    console.log('%c[🚀 Axios Request]', 'color: #3b82f6; font-weight: bold', config.method.toUpperCase(), config.url, config.data || '');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    console.error(`%c[❌ Axios Request Error] %c${error.message}`, 'color: #ef4444; font-weight: bold;', 'color: inherit;');
    return Promise.reject(error);
  }
);

axiosClient.interceptors.response.use(
  (response) => {
    // [Diagnostic Logger] Bắt bệnh response success
    console.log('%c[✅ Axios Success]', 'color: #10b981; font-weight: bold', response.status, response.data);
    return response.data;
  },
  (error) => {
    // [Diagnostic Logger] Bắt bệnh response error
    const status = error.response?.status || 'Network Error';
    console.error(
      `%c[❌ Axios Error] %c${error.config?.method?.toUpperCase() || 'UNKNOWN'} ${error.config?.url || ''} %c(Status: ${status})`,
      'color: #ef4444; font-weight: bold;',
      'color: #94a3b8;',
      'color: #ef4444;'
    );
    if (error.response?.data) {
       console.error('%c[❌ Axios Error Data] ', 'color: #ef4444;', error.response.data);
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default axiosClient;
