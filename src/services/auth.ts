import { authApi, api } from '@/utils/api';
import { API_ENDPOINTS, STORAGE_KEYS } from '@/utils/constants';
import type { User, AuthTokens, LoginCredentials, RegisterData } from '@/types';

export class AuthService {
  // 로그인
  static async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const formData = new FormData();
    formData.append('username', credentials.username);
    formData.append('password', credentials.password);

    const response = await authApi.post(API_ENDPOINTS.AUTH.LOGIN, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokens = response.data;
    
    // 토큰 저장
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
    
    return tokens;
  }

  // 회원가입
  static async register(userData: RegisterData): Promise<User> {
    return api.post<User>(API_ENDPOINTS.AUTH.REGISTER, userData, authApi);
  }

  // 로그아웃
  static async logout(): Promise<void> {
    try {
      await api.post(API_ENDPOINTS.AUTH.LOGOUT, {}, authApi);
    } finally {
      // 로컬 스토리지 정리
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  }

  // 현재 사용자 정보 조회
  static async getCurrentUser(): Promise<User> {
    return api.get<User>(API_ENDPOINTS.AUTH.ME, authApi);
  }

  // 토큰 갱신
  static async refreshToken(): Promise<AuthTokens> {
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) {
      throw new Error('리프레시 토큰이 없습니다.');
    }

    const tokens = await api.post<AuthTokens>(
      API_ENDPOINTS.AUTH.REFRESH,
      { refresh_token: refreshToken },
      authApi
    );

    // 새 토큰 저장
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);

    return tokens;
  }

  // 인증 상태 확인
  static isAuthenticated(): boolean {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    return !!token;
  }

  // 토큰 디코딩 (JWT 페이로드 추출)
  static decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }

  // 토큰 만료 확인
  static isTokenExpired(token?: string): boolean {
    const authToken = token || localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!authToken) return true;

    const decoded = this.decodeToken(authToken);
    if (!decoded?.exp) return true;

    return Date.now() >= decoded.exp * 1000;
  }

  // 관리자 권한 확인
  static isAdmin(): boolean {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    if (!userStr) return false;

    try {
      const user = JSON.parse(userStr) as User;
      return user.is_superuser;
    } catch {
      return false;
    }
  }
}
