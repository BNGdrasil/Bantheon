import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthService } from '@/services/auth';
import { STORAGE_KEYS } from '@/utils/constants';
import type { User, LoginCredentials, RegisterData } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user && AuthService.isAuthenticated();

  // 초기화 시 사용자 정보 로드
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (AuthService.isAuthenticated() && !AuthService.isTokenExpired()) {
          const userData = await AuthService.getCurrentUser();
          setUser(userData);
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
        } else {
          // 토큰이 만료되었거나 없는 경우 정리
          await logout();
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        await logout();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // 로그인
  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setIsLoading(true);
      await AuthService.login(credentials);
      const userData = await AuthService.getCurrentUser();
      setUser(userData);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // 회원가입
  const register = async (userData: RegisterData): Promise<void> => {
    try {
      setIsLoading(true);
      await AuthService.register(userData);
      // 회원가입 후 자동 로그인
      await login({
        username: userData.username,
        password: userData.password,
      });
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // 로그아웃
  const logout = async (): Promise<void> => {
    try {
      if (isAuthenticated) {
        await AuthService.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  };

  // 사용자 정보 새로고침
  const refreshUser = async (): Promise<void> => {
    try {
      if (isAuthenticated) {
        const userData = await AuthService.getCurrentUser();
        setUser(userData);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
      }
    } catch (error) {
      console.error('User refresh failed:', error);
      await logout();
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
