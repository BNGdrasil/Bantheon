import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { STORAGE_KEYS, API_ENDPOINTS } from './constants';
import type { ApiResponse, AuthTokens } from '@/types';

// Axios 인스턴스 생성
const createApiInstance = (baseURL: string): AxiosInstance => {
  const instance = axios.create({
    baseURL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // 요청 인터셉터 - 토큰 자동 첨부
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // 응답 인터셉터 - 토큰 만료 처리
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
          if (refreshToken) {
            const response = await authApi.post<ApiResponse<AuthTokens>>(
              API_ENDPOINTS.AUTH.REFRESH,
              { refresh_token: refreshToken }
            );

            if (response.data.success && response.data.data) {
              const { access_token, refresh_token } = response.data.data;
              localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token);
              localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
              
              originalRequest.headers.Authorization = `Bearer ${access_token}`;
              return instance(originalRequest);
            }
          }
        } catch (refreshError) {
          // 리프레시 토큰도 만료된 경우 로그아웃 처리
          localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          window.location.href = '/login';
        }
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

// API 인스턴스들
export const authApi = createApiInstance(
  import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8001'
);

export const gatewayApi = createApiInstance(
  import.meta.env.VITE_GATEWAY_API_URL || 'http://localhost:8000'
);

// 유틸리티 함수들
export const handleApiResponse = <T>(
  response: AxiosResponse<ApiResponse<T>>
): T => {
  if (response.data.success && response.data.data) {
    return response.data.data;
  }
  throw new Error(response.data.error || response.data.message || 'API 요청 실패');
};

export const handleApiError = (error: any): never => {
  if (error.response?.data?.error) {
    throw new Error(error.response.data.error);
  }
  if (error.response?.data?.message) {
    throw new Error(error.response.data.message);
  }
  if (error.message) {
    throw new Error(error.message);
  }
  throw new Error('알 수 없는 오류가 발생했습니다.');
};

// 기본 API 함수들
export const api = {
  get: async <T>(url: string, instance = gatewayApi): Promise<T> => {
    try {
      const response = await instance.get<ApiResponse<T>>(url);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  post: async <T>(url: string, data?: any, instance = gatewayApi): Promise<T> => {
    try {
      const response = await instance.post<ApiResponse<T>>(url, data);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  put: async <T>(url: string, data?: any, instance = gatewayApi): Promise<T> => {
    try {
      const response = await instance.put<ApiResponse<T>>(url, data);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },

  delete: async <T>(url: string, instance = gatewayApi): Promise<T> => {
    try {
      const response = await instance.delete<ApiResponse<T>>(url);
      return handleApiResponse(response);
    } catch (error) {
      return handleApiError(error);
    }
  },
};
