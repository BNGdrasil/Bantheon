import { api } from '@/utils/api';
import type { SystemMetrics, LogEntry } from '@/types';

// 모니터링 서비스
export class MonitoringService {
  // 시스템 메트릭 조회
  static async getSystemMetrics(timeRange: string = '1h'): Promise<SystemMetrics> {
    return api.get<SystemMetrics>(`/api/v1/monitoring/metrics?range=${timeRange}`);
  }

  // 특정 서비스 메트릭 조회
  static async getServiceMetrics(
    serviceName: string,
    timeRange: string = '1h'
  ): Promise<SystemMetrics> {
    return api.get<SystemMetrics>(
      `/api/v1/monitoring/services/${serviceName}/metrics?range=${timeRange}`
    );
  }

  // VM 메트릭 조회
  static async getVMMetrics(
    vmId: string,
    timeRange: string = '1h'
  ): Promise<SystemMetrics> {
    return api.get<SystemMetrics>(
      `/api/v1/monitoring/vms/${vmId}/metrics?range=${timeRange}`
    );
  }

  // 로그 조회
  static async getLogs(params: {
    service?: string;
    level?: string;
    limit?: number;
    offset?: number;
    start_time?: string;
    end_time?: string;
  }): Promise<{
    logs: LogEntry[];
    total: number;
    has_more: boolean;
  }> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    return api.get(`/api/v1/monitoring/logs?${queryParams.toString()}`);
  }

  // 알림 규칙 조회
  static async getAlertRules(): Promise<{
    id: string;
    name: string;
    condition: string;
    threshold: number;
    enabled: boolean;
    notification_channels: string[];
  }[]> {
    return api.get('/api/v1/monitoring/alerts/rules');
  }

  // 활성 알림 조회
  static async getActiveAlerts(): Promise<{
    id: string;
    rule_name: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    started_at: string;
    resolved_at?: string;
  }[]> {
    return api.get('/api/v1/monitoring/alerts/active');
  }

  // Grafana 대시보드 URL 가져오기
  static async getGrafanaDashboardUrl(dashboard?: string): Promise<{ url: string }> {
    const params = dashboard ? `?dashboard=${dashboard}` : '';
    return api.get(`/api/v1/monitoring/grafana/url${params}`);
  }

  // Prometheus 쿼리 실행
  static async executePrometheusQuery(query: string): Promise<{
    status: string;
    data: {
      resultType: string;
      result: any[];
    };
  }> {
    return api.post('/api/v1/monitoring/prometheus/query', { query });
  }
}

// 미리 정의된 메트릭 쿼리들
export const METRIC_QUERIES = {
  // 시스템 메트릭
  CPU_USAGE: 'rate(cpu_usage_total[5m]) * 100',
  MEMORY_USAGE: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
  DISK_USAGE: '(1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)) * 100',
  NETWORK_IN: 'rate(node_network_receive_bytes_total[5m]) * 8',
  NETWORK_OUT: 'rate(node_network_transmit_bytes_total[5m]) * 8',

  // 애플리케이션 메트릭
  HTTP_REQUESTS: 'rate(http_requests_total[5m])',
  HTTP_ERRORS: 'rate(http_requests_total{status=~"5.."}[5m])',
  RESPONSE_TIME: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',

  // OpenStack 메트릭
  VM_COUNT: 'openstack_nova_instances_total',
  VM_CPU_USAGE: 'openstack_nova_instance_cpu_usage',
  VM_MEMORY_USAGE: 'openstack_nova_instance_memory_usage',
} as const;

// 시간 범위 옵션
export const TIME_RANGES = [
  { label: '15분', value: '15m' },
  { label: '1시간', value: '1h' },
  { label: '6시간', value: '6h' },
  { label: '24시간', value: '24h' },
  { label: '7일', value: '7d' },
  { label: '30일', value: '30d' },
] as const;
