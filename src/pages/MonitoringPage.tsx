import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MonitoringService, TIME_RANGES } from '@/services/monitoring';
import {
  ChartBarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { LogEntry } from '@/types';

const MonitoringPage: React.FC = () => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [selectedService, setSelectedService] = useState('all');
  const [logLevel, setLogLevel] = useState('all');
  const [logSearch, setLogSearch] = useState('');

  // 시스템 메트릭 조회
  const { data: systemMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['system-metrics', selectedTimeRange],
    queryFn: () => MonitoringService.getSystemMetrics(selectedTimeRange),
    refetchInterval: 30000, // 30초마다 갱신
  });

  // 활성 알림 조회
  const { data: activeAlerts = [] } = useQuery({
    queryKey: ['active-alerts'],
    queryFn: MonitoringService.getActiveAlerts,
    refetchInterval: 10000, // 10초마다 갱신
  });

  // 로그 조회
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['logs', selectedService, logLevel, logSearch],
    queryFn: () =>
      MonitoringService.getLogs({
        service: selectedService !== 'all' ? selectedService : undefined,
        level: logLevel !== 'all' ? logLevel : undefined,
        limit: 100,
      }),
    refetchInterval: 5000, // 5초마다 갱신
  });

  // Grafana 대시보드 열기
  const openGrafana = async (dashboard?: string) => {
    try {
      const { url } = await MonitoringService.getGrafanaDashboardUrl(dashboard);
      window.open(url, '_blank');
    } catch (error) {
      alert(`Grafana 대시보드 열기 실패: ${error}`);
    }
  };

  const getLogLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warn':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'debug':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getAlertSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-700 bg-red-100 border-red-300';
      case 'high':
        return 'text-orange-700 bg-orange-100 border-orange-300';
      case 'medium':
        return 'text-yellow-700 bg-yellow-100 border-yellow-300';
      case 'low':
        return 'text-blue-700 bg-blue-100 border-blue-300';
      default:
        return 'text-gray-700 bg-gray-100 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <ChartBarIcon className="h-8 w-8 mr-3 text-blue-600" />
                모니터링 대시보드
              </h1>
              <p className="text-gray-600 mt-1">시스템 메트릭, 로그, 알림 관리</p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={selectedTimeRange}
                onChange={(e) => setSelectedTimeRange(e.target.value)}
                className="input max-w-xs"
              >
                {TIME_RANGES.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => openGrafana()}
                className="btn-primary inline-flex items-center"
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                Grafana 열기
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 알림 섹션 */}
        {activeAlerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-red-600" />
              활성 알림 ({activeAlerts.length})
            </h2>
            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 border rounded-lg ${getAlertSeverityColor(alert.severity)}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{alert.rule_name}</h3>
                      <p className="text-sm mt-1">{alert.message}</p>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getAlertSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </div>
                      <p className="text-xs mt-1">
                        {new Date(alert.started_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 메트릭 개요 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 시스템 메트릭 차트 영역 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">시스템 메트릭</h2>
              <button
                onClick={() => openGrafana('system')}
                className="btn-outline text-sm"
              >
                자세히 보기
              </button>
            </div>
            {metricsLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <div className="space-y-4">
                {/* 간단한 메트릭 표시 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">평균 CPU 사용률</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {systemMetrics?.cpu_usage.length ? 
                        Math.round(systemMetrics.cpu_usage[systemMetrics.cpu_usage.length - 1]?.value || 0) 
                        : 0}%
                    </p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">메모리 사용률</p>
                    <p className="text-2xl font-bold text-green-600">
                      {systemMetrics?.memory_usage.length ? 
                        Math.round(systemMetrics.memory_usage[systemMetrics.memory_usage.length - 1]?.value || 0) 
                        : 0}%
                    </p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">
                    실시간 차트는 Grafana에서 확인하세요
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 빠른 대시보드 링크 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">대시보드 바로가기</h2>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => openGrafana('system')}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  <ChartBarIcon className="h-5 w-5 text-blue-600 mr-3" />
                  <span className="text-sm font-medium">시스템 대시보드</span>
                </div>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
              </button>
              
              <button
                onClick={() => openGrafana('openstack')}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  <ChartBarIcon className="h-5 w-5 text-purple-600 mr-3" />
                  <span className="text-sm font-medium">OpenStack 대시보드</span>
                </div>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
              </button>
              
              <button
                onClick={() => openGrafana('applications')}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  <ChartBarIcon className="h-5 w-5 text-green-600 mr-3" />
                  <span className="text-sm font-medium">애플리케이션 대시보드</span>
                </div>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {/* 로그 섹션 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <DocumentTextIcon className="h-5 w-5 mr-2" />
                실시간 로그
              </h2>
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="로그 검색..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="input pl-10 max-w-xs"
                  />
                </div>
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="input max-w-xs"
                >
                  <option value="all">모든 서비스</option>
                  <option value="bifrost">Bifrost</option>
                  <option value="bidar">Bidar</option>
                  <option value="openstack">OpenStack</option>
                  <option value="nginx">Nginx</option>
                </select>
                <select
                  value={logLevel}
                  onChange={(e) => setLogLevel(e.target.value)}
                  className="input max-w-xs"
                >
                  <option value="all">모든 레벨</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-6">
            {logsLoading ? (
              <LoadingSpinner size="sm" />
            ) : logsData?.logs.length === 0 ? (
              <div className="text-center py-8">
                <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600">조건에 맞는 로그가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {logsData?.logs.map((log, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getLogLevelColor(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{log.service}</span>
                        <span className="text-xs text-gray-500 flex items-center">
                          <ClockIcon className="h-3 w-3 mr-1" />
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{log.message}</p>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="mt-2">
                          <pre className="text-xs text-gray-600 bg-gray-100 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {logsData?.has_more && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-500">
                  더 많은 로그를 보려면 Grafana의 Loki를 이용하세요
                </p>
                <button
                  onClick={() => openGrafana('logs')}
                  className="mt-2 btn-outline text-sm"
                >
                  Loki에서 보기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonitoringPage;
