import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/utils/constants';
import type { Service, ServiceConfig } from '@/types';

export class GatewayService {
  // 등록된 서비스 목록 조회
  static async getServices(): Promise<Service[]> {
    return api.get<Service[]>(API_ENDPOINTS.GATEWAY.SERVICES);
  }

  // 특정 서비스 상태 확인
  static async getServiceHealth(serviceName: string): Promise<{ status: string; details?: any }> {
    return api.get<{ status: string; details?: any }>(
      `${API_ENDPOINTS.GATEWAY.SERVICES}/${serviceName}/health`
    );
  }

  // 게이트웨이 전체 상태 확인
  static async getGatewayHealth(): Promise<{ status: string; services?: any }> {
    return api.get<{ status: string; services?: any }>(API_ENDPOINTS.GATEWAY.HEALTH);
  }

  // 메트릭 정보 조회 (Prometheus 형식)
  static async getMetrics(): Promise<string> {
    return api.get<string>(API_ENDPOINTS.GATEWAY.METRICS);
  }

}

// Admin 기능들을 별도 클래스로 분리
export class GatewayAdminService {
  // 새 서비스 등록
  static async addService(serviceConfig: ServiceConfig): Promise<Service> {
    return api.post<Service>(API_ENDPOINTS.GATEWAY.ADMIN.SERVICES, serviceConfig);
  }

  // 서비스 설정 업데이트
  static async updateService(serviceName: string, config: Partial<ServiceConfig['config']>): Promise<Service> {
    return api.put<Service>(`${API_ENDPOINTS.GATEWAY.ADMIN.SERVICES}/${serviceName}`, config);
  }

  // 서비스 제거
  static async removeService(serviceName: string): Promise<void> {
    return api.delete<void>(`${API_ENDPOINTS.GATEWAY.ADMIN.SERVICES}/${serviceName}`);
  }

  // 서비스 재시작 (헬스체크 재시작)
  static async restartService(serviceName: string): Promise<void> {
    return api.post<void>(`${API_ENDPOINTS.GATEWAY.ADMIN.SERVICES}/${serviceName}/restart`);
  }
}

// 미리 정의된 서비스 템플릿
export const SERVICE_TEMPLATES = {
  PYTHON_API: {
    timeout: 30,
    rate_limit: 100,
    health_check: '/health',
  },
  NODE_API: {
    timeout: 15,
    rate_limit: 200,
    health_check: '/ping',
  },
  STATIC_SITE: {
    timeout: 10,
    rate_limit: 500,
    health_check: '/',
  },
} as const;

// 서비스 상태별 스타일링을 위한 유틸리티
export const getServiceStatusStyle = (status: Service['status']) => {
  switch (status) {
    case 'healthy':
      return {
        color: 'text-green-600',
        bg: 'bg-green-100',
        border: 'border-green-200',
        icon: '🟢',
      };
    case 'unhealthy':
      return {
        color: 'text-red-600',
        bg: 'bg-red-100',
        border: 'border-red-200',
        icon: '🔴',
      };
    default:
      return {
        color: 'text-gray-600',
        bg: 'bg-gray-100',
        border: 'border-gray-200',
        icon: '⚪',
      };
  }
};
