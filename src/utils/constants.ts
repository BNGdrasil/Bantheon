// API 엔드포인트
export const API_ENDPOINTS = {
  // Auth Server (Bidar)
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  // API Gateway (Bifrost)
  GATEWAY: {
    SERVICES: '/api/v1/services',
    HEALTH: '/health',
    METRICS: '/metrics',
    ADMIN: {
      SERVICES: '/api/v1/admin/services',
    },
  },
} as const;

// 로컬 스토리지 키
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'bnbong_access_token',
  REFRESH_TOKEN: 'bnbong_refresh_token',
  USER: 'bnbong_user',
  THEME: 'bnbong_theme',
} as const;

// 앱 설정
export const APP_CONFIG = {
  NAME: 'Bantheon',
  DESCRIPTION: 'BNGdrasil Admin Dashboard & Portfolio',
  VERSION: '1.0.0',
  AUTHOR: 'bnbong',
  GITHUB_URL: 'https://github.com/BNGdrasil',
  CONTACT_EMAIL: 'bnbong@example.com',
  DOMAINS: {
    MAIN: 'bnbong.xyz',
    ADMIN: 'admin.bnbong.xyz',
    PLAYGROUND: 'playground.bnbong.xyz',
  },
} as const;

// 라우트 경로
export const ROUTES = {
  HOME: '/',
  PORTFOLIO: '/portfolio',
  ADMIN: '/admin',
  MONITORING: '/admin/monitoring',
  VM_MANAGEMENT: '/admin/vms',
  USER_MANAGEMENT: '/admin/users',
  LOGIN: '/login',
  REGISTER: '/register',
  NOT_FOUND: '/404',
} as const;

// BNGdrasil 프로젝트 정보
export const BNGDRASIL_PROJECTS = {
  BIFROST: {
    name: 'Bifrost',
    description: 'API Gateway 서비스',
    tech: ['Python', 'FastAPI', 'Docker'],
    emoji: '🌉',
    github: 'https://github.com/BNGdrasil/Bifrost',
  },
  BIDAR: {
    name: 'Bidar',
    description: 'Authentication & Authorization 서버',
    tech: ['Python', 'FastAPI', 'JWT', 'PostgreSQL'],
    emoji: '🔐',
    github: 'https://github.com/BNGdrasil/Bidar',
  },
  BANTHEON: {
    name: 'Bantheon',
    description: 'Web Frontend & Portfolio',
    tech: ['React', 'TypeScript', 'TailwindCSS'],
    emoji: '🎨',
    github: 'https://github.com/BNGdrasil/Bantheon',
  },
  BLYSIUM: {
    name: 'Blysium',
    description: 'Gaming Platform (별도 도메인)',
    tech: ['React', 'TypeScript', 'Canvas API', 'WebGL'],
    emoji: '🎮',
    github: 'https://github.com/BNGdrasil/Blysium',
    domain: 'playground.bnbong.xyz',
  },
  BAEDALUS: {
    name: 'Baedalus',
    description: 'Infrastructure as Code (Terraform)',
    tech: ['Terraform', 'Oracle Cloud', 'OpenStack'],
    emoji: '🏗️',
    github: 'https://github.com/BNGdrasil/Baedalus',
  },
  BSGARD: {
    name: 'Bsgard',
    description: 'Custom VPC & Networking',
    tech: ['OpenStack', 'Neutron', 'Python'],
    emoji: '🌐',
    github: 'https://github.com/BNGdrasil/Bsgard',
  },
} as const;

// 테마 설정
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

// 애니메이션 설정
export const ANIMATIONS = {
  DURATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
  },
  EASING: {
    IN: 'ease-in',
    OUT: 'ease-out',
    IN_OUT: 'ease-in-out',
  },
} as const;
