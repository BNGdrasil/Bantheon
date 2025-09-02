// 사용자 관련 타입
export interface User {
  id: string;
  username: string;
  email: string;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
}

// 인증 관련 타입
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

// API 응답 타입
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// 서비스 관련 타입 (API Gateway용)
export interface Service {
  name: string;
  url: string;
  health_check: string;
  timeout: number;
  rate_limit: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  last_check?: string;
}

export interface ServiceConfig {
  name: string;
  config: Omit<Service, 'name' | 'status' | 'last_check'>;
}

// VM 관리 관련 타입
export interface VirtualMachine {
  id: string;
  name: string;
  status: 'active' | 'stopped' | 'error' | 'building';
  flavor: string;
  image: string;
  networks: string[];
  user_id: string;
  user_name: string;
  created_at: string;
  updated_at: string;
  ip_addresses: {
    private?: string;
    public?: string;
  };
  specs: {
    vcpus: number;
    ram: number; // MB
    disk: number; // GB
  };
}

export interface VMFlavor {
  id: string;
  name: string;
  vcpus: number;
  ram: number;
  disk: number;
  description?: string;
}

export interface VMImage {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  size: number;
  created_at: string;
  min_disk: number;
  min_ram: number;
}

export interface VMNetwork {
  id: string;
  name: string;
  subnet_id: string;
  cidr: string;
  gateway_ip: string;
}

// 모니터링 관련 타입
export interface MetricData {
  timestamp: string;
  value: number;
}

export interface SystemMetrics {
  cpu_usage: MetricData[];
  memory_usage: MetricData[];
  disk_usage: MetricData[];
  network_traffic: {
    in: MetricData[];
    out: MetricData[];
  };
}

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  message: string;
  metadata?: Record<string, any>;
}

// 사용자 관리 관련 타입
export interface FriendUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  status: 'active' | 'suspended' | 'pending';
  vm_quota: {
    max_instances: number;
    max_vcpus: number;
    max_ram: number; // GB
    max_storage: number; // GB
  };
  vm_usage: {
    instances: number;
    vcpus: number;
    ram: number;
    storage: number;
  };
  created_at: string;
  last_login?: string;
}

// 포트폴리오 관련 타입
export interface Project {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  github_url?: string;
  demo_url?: string;
  image?: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

// 네비게이션 메뉴 타입
export interface NavItem {
  name: string;
  href: string;
  icon?: React.ComponentType<any>;
  current?: boolean;
}

// 공통 에러 타입
export interface AppError {
  code: string;
  message: string;
  details?: any;
}

// 설정 타입
export interface AppConfig {
  api: {
    gateway_url: string;
    auth_url: string;
  };
  features: {
    enable_admin: boolean;
    enable_games: boolean;
    enable_portfolio: boolean;
  };
}
