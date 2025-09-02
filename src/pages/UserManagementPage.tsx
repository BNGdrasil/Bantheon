import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserManagementService } from '@/services/vm';
import {
  UserGroupIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ServerIcon,

} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { FriendUser } from '@/types';

const UserManagementPage: React.FC = () => {
  const [selectedUser, setSelectedUser] = useState<FriendUser | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // 친구 사용자 목록 조회
  const { data: friendUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['friend-users'],
    queryFn: UserManagementService.getFriendUsers,
  });

  // 사용자 상태 변경 mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: FriendUser['status'] }) =>
      UserManagementService.updateUserStatus(userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-users'] });
    },
  });

  // 사용자 삭제 mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => UserManagementService.deleteFriendUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-users'] });
    },
  });

  const getStatusIcon = (status: FriendUser['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'suspended':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusText = (status: FriendUser['status']) => {
    switch (status) {
      case 'active':
        return '활성';
      case 'suspended':
        return '일시정지';
      case 'pending':
        return '대기 중';
      default:
        return '알 수 없음';
    }
  };

  const getStatusColor = (status: FriendUser['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'suspended':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'pending':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const handleStatusChange = async (userId: string, status: FriendUser['status']) => {
    try {
      await updateStatusMutation.mutateAsync({ userId, status });
    } catch (error) {
      alert(`상태 변경 실패: ${error}`);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`정말로 사용자 "${username}"을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteUserMutation.mutateAsync(userId);
    } catch (error) {
      alert(`사용자 삭제 실패: ${error}`);
    }
  };

  const calculateUsagePercentage = (used: number, max: number) => {
    return max > 0 ? Math.round((used / max) * 100) : 0;
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600 bg-red-100';
    if (percentage >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <UserGroupIcon className="h-8 w-8 mr-3 text-blue-600" />
                사용자 관리
              </h1>
              <p className="text-gray-600 mt-1">친구들의 계정 및 VM 할당량 관리</p>
            </div>
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="btn-primary inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              친구 초대
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 사용자 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <UserGroupIcon className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">전체 사용자</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {friendUsers.length}
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
                <p className="text-sm font-medium text-gray-500">활성 사용자</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {friendUsers.filter(u => u.status === 'active').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">대기 중</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {friendUsers.filter(u => u.status === 'pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ServerIcon className="h-8 w-8 text-purple-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">총 VM 사용량</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {friendUsers.reduce((sum, user) => sum + user.vm_usage.instances, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">사용자 목록</h2>
          </div>

          {usersLoading ? (
            <LoadingSpinner />
          ) : friendUsers.length === 0 ? (
            <div className="p-6 text-center">
              <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600">초대된 사용자가 없습니다.</p>
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="mt-4 btn-primary"
              >
                첫 번째 사용자 초대하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      사용자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      VM 사용량
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      리소스 사용량
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      마지막 로그인
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {friendUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 font-medium text-sm">
                                {user.display_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.display_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              @{user.username} • {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(user.status)}`}>
                          {getStatusIcon(user.status)}
                          <span className="ml-1">{getStatusText(user.status)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">인스턴스:</span>
                            <span className={`text-sm font-medium px-2 py-1 rounded ${getUsageColor(calculateUsagePercentage(user.vm_usage.instances, user.vm_quota.max_instances))}`}>
                              {user.vm_usage.instances} / {user.vm_quota.max_instances}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">vCPU:</span>
                            <span className={`font-medium px-1.5 py-0.5 rounded ${getUsageColor(calculateUsagePercentage(user.vm_usage.vcpus, user.vm_quota.max_vcpus))}`}>
                              {user.vm_usage.vcpus}/{user.vm_quota.max_vcpus}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">RAM:</span>
                            <span className={`font-medium px-1.5 py-0.5 rounded ${getUsageColor(calculateUsagePercentage(user.vm_usage.ram, user.vm_quota.max_ram))}`}>
                              {user.vm_usage.ram}/{user.vm_quota.max_ram}GB
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Storage:</span>
                            <span className={`font-medium px-1.5 py-0.5 rounded ${getUsageColor(calculateUsagePercentage(user.vm_usage.storage, user.vm_quota.max_storage))}`}>
                              {user.vm_usage.storage}/{user.vm_quota.max_storage}GB
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : '없음'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setIsEditModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                            title="편집"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <select
                            value={user.status}
                            onChange={(e) => handleStatusChange(user.id, e.target.value as FriendUser['status'])}
                            className="text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="active">활성</option>
                            <option value="suspended">일시정지</option>
                            <option value="pending">대기</option>
                          </select>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            disabled={deleteUserMutation.isPending}
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

      {/* 초대 모달 */}
      {isInviteModalOpen && (
        <InviteUserModal
          onClose={() => setIsInviteModalOpen(false)}
          onSuccess={() => {
            setIsInviteModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['friend-users'] });
          }}
        />
      )}

      {/* 편집 모달 */}
      {isEditModalOpen && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setIsEditModalOpen(false);
            setSelectedUser(null);
            queryClient.invalidateQueries({ queryKey: ['friend-users'] });
          }}
        />
      )}
    </div>
  );
};

// 사용자 초대 모달
const InviteUserModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    email: '',
    display_name: '',
    vm_quota: {
      max_instances: 2,
      max_vcpus: 4,
      max_ram: 8,
      max_storage: 100,
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: (data: typeof formData) => UserManagementService.inviteFriend(data),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      alert(`사용자 초대 실패: ${error}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteUserMutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">친구 초대</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              표시 이름
            </label>
            <input
              type="text"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">VM 할당량</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">최대 인스턴스</label>
                <input
                  type="number"
                  value={formData.vm_quota.max_instances}
                  onChange={(e) => setFormData({
                    ...formData,
                    vm_quota: { ...formData.vm_quota, max_instances: Number(e.target.value) }
                  })}
                  className="input"
                  min="1"
                  max="10"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">최대 vCPU</label>
                <input
                  type="number"
                  value={formData.vm_quota.max_vcpus}
                  onChange={(e) => setFormData({
                    ...formData,
                    vm_quota: { ...formData.vm_quota, max_vcpus: Number(e.target.value) }
                  })}
                  className="input"
                  min="1"
                  max="32"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">최대 RAM (GB)</label>
                <input
                  type="number"
                  value={formData.vm_quota.max_ram}
                  onChange={(e) => setFormData({
                    ...formData,
                    vm_quota: { ...formData.vm_quota, max_ram: Number(e.target.value) }
                  })}
                  className="input"
                  min="1"
                  max="64"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">최대 Storage (GB)</label>
                <input
                  type="number"
                  value={formData.vm_quota.max_storage}
                  onChange={(e) => setFormData({
                    ...formData,
                    vm_quota: { ...formData.vm_quota, max_storage: Number(e.target.value) }
                  })}
                  className="input"
                  min="10"
                  max="1000"
                />
              </div>
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
              disabled={inviteUserMutation.isPending}
              className="btn-primary"
            >
              {inviteUserMutation.isPending ? '초대 중...' : '초대'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 사용자 편집 모달
const EditUserModal: React.FC<{
  user: FriendUser;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ user, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    vm_quota: { ...user.vm_quota },
  });

  const updateQuotaMutation = useMutation({
    mutationFn: (quota: FriendUser['vm_quota']) =>
      UserManagementService.updateUserQuota(user.id, quota),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      alert(`할당량 업데이트 실패: ${error}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateQuotaMutation.mutate(formData.vm_quota);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {user.display_name} 할당량 편집
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                최대 인스턴스
              </label>
              <input
                type="number"
                value={formData.vm_quota.max_instances}
                onChange={(e) => setFormData({
                  ...formData,
                  vm_quota: { ...formData.vm_quota, max_instances: Number(e.target.value) }
                })}
                className="input"
                min="1"
                max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                최대 vCPU
              </label>
              <input
                type="number"
                value={formData.vm_quota.max_vcpus}
                onChange={(e) => setFormData({
                  ...formData,
                  vm_quota: { ...formData.vm_quota, max_vcpus: Number(e.target.value) }
                })}
                className="input"
                min="1"
                max="32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                최대 RAM (GB)
              </label>
              <input
                type="number"
                value={formData.vm_quota.max_ram}
                onChange={(e) => setFormData({
                  ...formData,
                  vm_quota: { ...formData.vm_quota, max_ram: Number(e.target.value) }
                })}
                className="input"
                min="1"
                max="64"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                최대 Storage (GB)
              </label>
              <input
                type="number"
                value={formData.vm_quota.max_storage}
                onChange={(e) => setFormData({
                  ...formData,
                  vm_quota: { ...formData.vm_quota, max_storage: Number(e.target.value) }
                })}
                className="input"
                min="10"
                max="1000"
              />
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">현재 사용량</h4>
            <div className="text-xs space-y-1">
              <div>인스턴스: {user.vm_usage.instances}</div>
              <div>vCPU: {user.vm_usage.vcpus}</div>
              <div>RAM: {user.vm_usage.ram} GB</div>
              <div>Storage: {user.vm_usage.storage} GB</div>
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
              disabled={updateQuotaMutation.isPending}
              className="btn-primary"
            >
              {updateQuotaMutation.isPending ? '업데이트 중...' : '업데이트'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserManagementPage;
