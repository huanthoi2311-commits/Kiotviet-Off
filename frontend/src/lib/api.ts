import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1',
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Chuẩn hóa lỗi theo error contract của backend ({ error: { code, message } }).
    // Xử lý refresh-token / redirect 401 thuộc Prompt Authentication (011+).
    return Promise.reject(error);
  },
);
