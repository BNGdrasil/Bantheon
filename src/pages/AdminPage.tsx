import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GatewayService, GatewayAdminService } from '@/services/gateway';
import { AuthService } from '@/services/auth';
import {
  ServerIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowPathIcon,
  ChartBarIcon,

  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { Service, ServiceConfig } from '@/types';

const AdminPage: React.FC = () => {
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const queryClient = useQueryClient();

  // 서비스 목록 조회
  const { data: services = [], isLoading: servicesLoading, error: servicesError } = useQuery({
    queryKey: ['services'],
    queryFn: GatewayService.getServices,
  });

  // 게이트웨이 헬스 조회
  const { data: gatewayHealth, isLoading: healthLoading } = useQuery({
    queryKey: ['gateway-health'],
    queryFn: GatewayService.getGatewayHealth,
    refetchInterval: 30000, // 30초마다 갱신
  });

  // 서비스 제거 mutation
  const removeServiceMutation = useMutation({
    mutationFn: (serviceName: string) => GatewayAdminService.removeService(serviceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  // 서비스 재시작 mutation
  const restartServiceMutation = useMutation({
    mutationFn: (serviceName: string) => GatewayAdminService.restartService(serviceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const handleRemoveService = async (serviceName: string) => {
    if (window.confirm(`정말로 ${serviceName} 서비스를 제거하시겠습니까?`)) {
      try {
        await removeServiceMutation.mutateAsync(serviceName);
      } catch (error) {
        alert('서비스 제거에 실패했습니다.');
      }
    }
  };

  const handleRestartService = async (serviceName: string) => {
    try {
      await restartServiceMutation.mutateAsync(serviceName);
    } catch (error) {
      alert('서비스 재시작에 실패했습니다.');
    }
  };

  const getServiceStatusIcon = (status: Service['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'unhealthy':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getServiceStatusText = (status: Service['status']) => {
    switch (status) {
      case 'healthy':
        return '정상';
      case 'unhealthy':
        return '오류';
      default:
        return '알 수 없음';
    }
  };

  const getServiceStatusColor = (status: Service['status']) => {
    switch (status) {
      case 'healthy':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'unhealthy':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    }
  };

  if (!AuthService.isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">접근 권한이 없습니다</h2>
          <p className="text-gray-600">관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <ServerIcon className="h-8 w-8 mr-3 text-blue-600" />
                서비스 관리
              </h1>
              <p className="text-gray-600 mt-1">Bifrost API Gateway에 연결된 서비스 관리</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => queryClient.invalidateQueries()}
                className="btn-outline inline-flex items-center"
              >
                <ArrowPathIcon className="h-4 w-4 mr-2" />
                새로고침
              </button>
              <button
                onClick={() => setIsAddServiceModalOpen(true)}
                className="btn-primary inline-flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                서비스 추가
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ServerIcon className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">등록된 서비스</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {servicesLoading ? '-' : services.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">정상 서비스</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {servicesLoading ? '-' : services.filter(s => s.status === 'healthy').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">게이트웨이 상태</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {healthLoading ? '-' : gatewayHealth?.status || '알 수 없음'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Services Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">서비스 목록</h2>
          </div>

          {servicesLoading ? (
            <LoadingSpinner />
          ) : servicesError ? (
            <div className="p-6 text-center">
              <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500 mb-4" />
              <p className="text-red-600">서비스 목록을 불러오는데 실패했습니다.</p>
            </div>
          ) : services.length === 0 ? (
            <div className="p-6 text-center">
              <ServerIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600">등록된 서비스가 없습니다.</p>
              <button
                onClick={() => setIsAddServiceModalOpen(true)}
                className="mt-4 btn-primary"
              >
                첫 번째 서비스 추가하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      서비스
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      설정
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {services.map((service) => (
                    <tr key={service.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                              <ServerIcon className="h-5 w-5 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {service.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Health Check: {service.health_check}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getServiceStatusColor(service.status)}`}>
                          {getServiceStatusIcon(service.status)}
                          <span className="ml-1">{getServiceStatusText(service.status)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {service.url}
                        </code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="space-y-1">
                          <div>Timeout: {service.timeout}s</div>
                          <div>Rate Limit: {service.rate_limit}/min</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleRestartService(service.name)}
                            disabled={restartServiceMutation.isPending}
                            className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                            title="서비스 재시작"
                          >
                            <ArrowPathIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setSelectedService(service)}
                            className="text-green-600 hover:text-green-900"
                            title="서비스 편집"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveService(service.name)}
                            disabled={removeServiceMutation.isPending}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            title="서비스 제거"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">빠른 관리</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/admin/vms"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ServerIcon className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">VM 관리</h3>
                <p className="text-sm text-gray-600">OpenStack 가상머신 관리</p>
              </div>
            </Link>
            
            <Link
              to="/admin/monitoring"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ChartBarIcon className="h-8 w-8 text-purple-600 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">모니터링</h3>
                <p className="text-sm text-gray-600">시스템 메트릭 및 로그</p>
              </div>
            </Link>
            
            <Link
              to="/admin/users"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <UserIcon className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <h3 className="font-medium text-gray-900">사용자 관리</h3>
                <p className="text-sm text-gray-600">친구들 계정 관리</p>
              </div>
            </Link>
          </div>
        </div>

        {/* System Info */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">BNGdrasil 생태계</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">현재 배포된 서비스</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div>• Bifrost: API Gateway (현재 페이지)</div>
                <div>• Bidar: 인증 서버</div>
                <div>• Bantheon: 관리자 대시보드</div>
                <div>• Blysium: 게임 플랫폼 (별도 도메인)</div>
              </div>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">인프라 구성</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div>• OpenStack: VM 가상화 플랫폼</div>
                <div>• Prometheus: 메트릭 수집</div>
                <div>• Grafana: 시각화 대시보드</div>
                <div>• Loki: 로그 집계 시스템</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Service Modal */}
      {isAddServiceModalOpen && (
        <AddServiceModal
          onClose={() => setIsAddServiceModalOpen(false)}
          onSuccess={() => {
            setIsAddServiceModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['services'] });
          }}
        />
      )}

      {/* Edit Service Modal */}
      {selectedService && (
        <EditServiceModal
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onSuccess={() => {
            setSelectedService(null);
            queryClient.invalidateQueries({ queryKey: ['services'] });
          }}
        />
      )}
    </div>
  );
};

// Add Service Modal Component
const AddServiceModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    health_check: '/health',
    timeout: 30,
    rate_limit: 100,
  });

  const addServiceMutation = useMutation({
    mutationFn: (serviceConfig: ServiceConfig) => GatewayAdminService.addService(serviceConfig),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      alert(`서비스 추가 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addServiceMutation.mutate({
      name: formData.name,
      config: {
        url: formData.url,
        health_check: formData.health_check,
        timeout: formData.timeout,
        rate_limit: formData.rate_limit,
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">새 서비스 추가</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              서비스 이름
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              서비스 URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="input"
              placeholder="http://localhost:8002"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Health Check Path
            </label>
            <input
              type="text"
              value={formData.health_check}
              onChange={(e) => setFormData({ ...formData, health_check: e.target.value })}
              className="input"
              placeholder="/health"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timeout (초)
              </label>
              <input
                type="number"
                value={formData.timeout}
                onChange={(e) => setFormData({ ...formData, timeout: Number(e.target.value) })}
                className="input"
                min="1"
                max="300"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rate Limit (분당)
              </label>
              <input
                type="number"
                value={formData.rate_limit}
                onChange={(e) => setFormData({ ...formData, rate_limit: Number(e.target.value) })}
                className="input"
                min="1"
                max="10000"
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={addServiceMutation.isPending}
              className="btn-primary"
            >
              {addServiceMutation.isPending ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Edit Service Modal Component
const EditServiceModal: React.FC<{
  service: Service;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ service, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    url: service.url,
    health_check: service.health_check,
    timeout: service.timeout,
    rate_limit: service.rate_limit,
  });

  const updateServiceMutation = useMutation({
    mutationFn: (data: { name: string; config: Partial<typeof formData> }) =>
      GatewayAdminService.updateService(data.name, data.config),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      alert(`서비스 수정 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateServiceMutation.mutate({
      name: service.name,
      config: formData,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          서비스 편집: {service.name}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              서비스 URL
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Health Check Path
            </label>
            <input
              type="text"
              value={formData.health_check}
              onChange={(e) => setFormData({ ...formData, health_check: e.target.value })}
              className="input"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timeout (초)
              </label>
              <input
                type="number"
                value={formData.timeout}
                onChange={(e) => setFormData({ ...formData, timeout: Number(e.target.value) })}
                className="input"
                min="1"
                max="300"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rate Limit (분당)
              </label>
              <input
                type="number"
                value={formData.rate_limit}
                onChange={(e) => setFormData({ ...formData, rate_limit: Number(e.target.value) })}
                className="input"
                min="1"
                max="10000"
                required
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={updateServiceMutation.isPending}
              className="btn-primary"
            >
              {updateServiceMutation.isPending ? '수정 중...' : '수정'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminPage;
