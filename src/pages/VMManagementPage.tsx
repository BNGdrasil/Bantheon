import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VMService, ResourceService, UserManagementService } from '@/services/vm';
import {
  ServerIcon,
  PlusIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  ComputerDesktopIcon,
  CpuChipIcon,
  CircleStackIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { VirtualMachine, FriendUser } from '@/types';

const VMManagementPage: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // VM 목록 조회
  const { data: vms = [], isLoading: vmsLoading } = useQuery({
    queryKey: ['vms', selectedUser],
    queryFn: () =>
      selectedUser === 'all' ? VMService.getVMs() : VMService.getUserVMs(selectedUser),
  });

  // 친구 사용자 목록 조회
  const { data: friendUsers = [] } = useQuery({
    queryKey: ['friend-users'],
    queryFn: UserManagementService.getFriendUsers,
  });

  // 리소스 사용량 조회
  const { data: resourceUsage } = useQuery({
    queryKey: ['resource-usage'],
    queryFn: ResourceService.getResourceUsage,
    refetchInterval: 30000, // 30초마다 갱신
  });

  // VM 시작 mutation
  const startVMMutation = useMutation({
    mutationFn: (vmId: string) => VMService.startVM(vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  // VM 정지 mutation
  const stopVMMutation = useMutation({
    mutationFn: (vmId: string) => VMService.stopVM(vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  // VM 재시작 mutation
  const rebootVMMutation = useMutation({
    mutationFn: (vmId: string) => VMService.rebootVM(vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
    },
  });

  // VM 삭제 mutation
  const deleteVMMutation = useMutation({
    mutationFn: (vmId: string) => VMService.deleteVM(vmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vms'] });
      queryClient.invalidateQueries({ queryKey: ['resource-usage'] });
    },
  });

  const getStatusIcon = (status: VirtualMachine['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'stopped':
        return <XCircleIcon className="h-5 w-5 text-gray-500" />;
      case 'error':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      case 'building':
        return <ArrowPathIcon className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusText = (status: VirtualMachine['status']) => {
    switch (status) {
      case 'active':
        return '실행 중';
      case 'stopped':
        return '정지됨';
      case 'error':
        return '오류';
      case 'building':
        return '생성 중';
      default:
        return '알 수 없음';
    }
  };

  const handleVMAction = async (action: string, vmId: string, vmName: string) => {
    if (action === 'delete') {
      if (!window.confirm(`정말로 VM "${vmName}"을(를) 삭제하시겠습니까?`)) {
        return;
      }
    }

    try {
      switch (action) {
        case 'start':
          await startVMMutation.mutateAsync(vmId);
          break;
        case 'stop':
          await stopVMMutation.mutateAsync(vmId);
          break;
        case 'reboot':
          await rebootVMMutation.mutateAsync(vmId);
          break;
        case 'delete':
          await deleteVMMutation.mutateAsync(vmId);
          break;
      }
    } catch (error) {
      alert(`작업 실행 실패: ${error}`);
    }
  };

  const openConsole = async (vmId: string) => {
    try {
      const { console_url } = await VMService.getVMConsole(vmId);
      window.open(console_url, '_blank', 'width=800,height=600');
    } catch (error) {
      alert(`콘솔 열기 실패: ${error}`);
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
                <ServerIcon className="h-8 w-8 mr-3 text-blue-600" />
                가상머신 관리
              </h1>
              <p className="text-gray-600 mt-1">OpenStack 기반 VM 인스턴스 관리</p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="input max-w-xs"
              >
                <option value="all">모든 사용자</option>
                {friendUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name} ({user.username})
                  </option>
                ))}
              </select>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="btn-primary inline-flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                VM 생성
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 리소스 사용량 개요 */}
        {resourceUsage && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ServerIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">VM 인스턴스</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {resourceUsage.used_instances} / {resourceUsage.total_instances}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CpuChipIcon className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">vCPU</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {resourceUsage.used_vcpus} / {resourceUsage.total_vcpus}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CircleStackIcon className="h-8 w-8 text-purple-600" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">RAM</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {Math.round(resourceUsage.used_ram / 1024)} / {Math.round(resourceUsage.total_ram / 1024)} GB
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CircleStackIcon className="h-8 w-8 text-orange-600" />
                </div>
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Storage</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {resourceUsage.used_storage} / {resourceUsage.total_storage} GB
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VM 목록 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">VM 인스턴스 목록</h2>
          </div>

          {vmsLoading ? (
            <LoadingSpinner />
          ) : vms.length === 0 ? (
            <div className="p-6 text-center">
              <ServerIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600">생성된 VM이 없습니다.</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-4 btn-primary"
              >
                첫 번째 VM 생성하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VM 정보
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      사용자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      사양
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP 주소
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {vms.map((vm) => (
                    <tr key={vm.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                              <ServerIcon className="h-5 w-5 text-blue-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{vm.name}</div>
                            <div className="text-sm text-gray-500">{vm.flavor}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <UserGroupIcon className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900">{vm.user_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(vm.status)}
                          <span className="ml-2 text-sm text-gray-900">
                            {getStatusText(vm.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="space-y-1">
                          <div>CPU: {vm.specs.vcpus} vCPUs</div>
                          <div>RAM: {Math.round(vm.specs.ram / 1024)} GB</div>
                          <div>Disk: {vm.specs.disk} GB</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="space-y-1">
                          {vm.ip_addresses.private && (
                            <div>Private: {vm.ip_addresses.private}</div>
                          )}
                          {vm.ip_addresses.public && (
                            <div>Public: {vm.ip_addresses.public}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          {vm.status === 'stopped' && (
                            <button
                              onClick={() => handleVMAction('start', vm.id, vm.name)}
                              disabled={startVMMutation.isPending}
                              className="text-green-600 hover:text-green-900 disabled:opacity-50"
                              title="시작"
                            >
                              <PlayIcon className="h-4 w-4" />
                            </button>
                          )}
                          {vm.status === 'active' && (
                            <>
                              <button
                                onClick={() => handleVMAction('stop', vm.id, vm.name)}
                                disabled={stopVMMutation.isPending}
                                className="text-yellow-600 hover:text-yellow-900 disabled:opacity-50"
                                title="정지"
                              >
                                <StopIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleVMAction('reboot', vm.id, vm.name)}
                                disabled={rebootVMMutation.isPending}
                                className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                                title="재시작"
                              >
                                <ArrowPathIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openConsole(vm.id)}
                                className="text-purple-600 hover:text-purple-900"
                                title="콘솔"
                              >
                                <ComputerDesktopIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleVMAction('delete', vm.id, vm.name)}
                            disabled={deleteVMMutation.isPending}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            title="삭제"
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
      </div>

      {/* VM 생성 모달 */}
      {isCreateModalOpen && (
        <CreateVMModal
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['vms'] });
            queryClient.invalidateQueries({ queryKey: ['resource-usage'] });
          }}
          friendUsers={friendUsers}
        />
      )}
    </div>
  );
};

// VM 생성 모달 컴포넌트
const CreateVMModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
  friendUsers: FriendUser[];
}> = ({ onClose, onSuccess, friendUsers }) => {
  const [formData, setFormData] = useState({
    name: '',
    user_id: '',
    flavor_id: '',
    image_id: '',
    network_id: '',
  });

  // Flavors, Images, Networks 조회
  const { data: flavors = [] } = useQuery({
    queryKey: ['flavors'],
    queryFn: ResourceService.getFlavors,
  });

  const { data: images = [] } = useQuery({
    queryKey: ['images'],
    queryFn: ResourceService.getImages,
  });

  const { data: networks = [] } = useQuery({
    queryKey: ['networks'],
    queryFn: ResourceService.getNetworks,
  });

  const createVMMutation = useMutation({
    mutationFn: (data: typeof formData) => VMService.createVM(data),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      alert(`VM 생성 실패: ${error}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVMMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">새 VM 생성</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              VM 이름
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
              사용자
            </label>
            <select
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
              className="input"
              required
            >
              <option value="">사용자 선택</option>
              {friendUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} ({user.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flavor
            </label>
            <select
              value={formData.flavor_id}
              onChange={(e) => setFormData({ ...formData, flavor_id: e.target.value })}
              className="input"
              required
            >
              <option value="">Flavor 선택</option>
              {flavors.map((flavor) => (
                <option key={flavor.id} value={flavor.id}>
                  {flavor.name} ({flavor.vcpus} vCPU, {Math.round(flavor.ram / 1024)} GB RAM)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이미지
            </label>
            <select
              value={formData.image_id}
              onChange={(e) => setFormData({ ...formData, image_id: e.target.value })}
              className="input"
              required
            >
              <option value="">이미지 선택</option>
              {images.map((image) => (
                <option key={image.id} value={image.id}>
                  {image.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              네트워크
            </label>
            <select
              value={formData.network_id}
              onChange={(e) => setFormData({ ...formData, network_id: e.target.value })}
              className="input"
              required
            >
              <option value="">네트워크 선택</option>
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name} ({network.cidr})
                </option>
              ))}
            </select>
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
              disabled={createVMMutation.isPending}
              className="btn-primary"
            >
              {createVMMutation.isPending ? '생성 중...' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VMManagementPage;
