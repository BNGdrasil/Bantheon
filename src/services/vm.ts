import { api } from '@/utils/api';
import type { VirtualMachine, VMFlavor, VMImage, VMNetwork, FriendUser } from '@/types';

// VM 관리 서비스
export class VMService {
  // VM 목록 조회
  static async getVMs(): Promise<VirtualMachine[]> {
    return api.get<VirtualMachine[]>('/api/v1/vms');
  }

  // 특정 사용자의 VM 목록 조회
  static async getUserVMs(userId: string): Promise<VirtualMachine[]> {
    return api.get<VirtualMachine[]>(`/api/v1/users/${userId}/vms`);
  }

  // VM 상세 정보 조회
  static async getVM(vmId: string): Promise<VirtualMachine> {
    return api.get<VirtualMachine>(`/api/v1/vms/${vmId}`);
  }

  // VM 생성
  static async createVM(data: {
    name: string;
    flavor_id: string;
    image_id: string;
    network_id: string;
    user_id: string;
  }): Promise<VirtualMachine> {
    return api.post<VirtualMachine>('/api/v1/vms', data);
  }

  // VM 시작
  static async startVM(vmId: string): Promise<void> {
    return api.post<void>(`/api/v1/vms/${vmId}/start`);
  }

  // VM 정지
  static async stopVM(vmId: string): Promise<void> {
    return api.post<void>(`/api/v1/vms/${vmId}/stop`);
  }

  // VM 재시작
  static async rebootVM(vmId: string): Promise<void> {
    return api.post<void>(`/api/v1/vms/${vmId}/reboot`);
  }

  // VM 삭제
  static async deleteVM(vmId: string): Promise<void> {
    return api.delete<void>(`/api/v1/vms/${vmId}`);
  }

  // VM 콘솔 URL 가져오기
  static async getVMConsole(vmId: string): Promise<{ console_url: string }> {
    return api.get<{ console_url: string }>(`/api/v1/vms/${vmId}/console`);
  }
}

// 리소스 관리 서비스
export class ResourceService {
  // Flavor 목록 조회
  static async getFlavors(): Promise<VMFlavor[]> {
    return api.get<VMFlavor[]>('/api/v1/flavors');
  }

  // Image 목록 조회
  static async getImages(): Promise<VMImage[]> {
    return api.get<VMImage[]>('/api/v1/images');
  }

  // Network 목록 조회
  static async getNetworks(): Promise<VMNetwork[]> {
    return api.get<VMNetwork[]>('/api/v1/networks');
  }

  // 전체 리소스 사용량 조회
  static async getResourceUsage(): Promise<{
    total_vcpus: number;
    used_vcpus: number;
    total_ram: number;
    used_ram: number;
    total_storage: number;
    used_storage: number;
    total_instances: number;
    used_instances: number;
  }> {
    return api.get('/api/v1/resources/usage');
  }
}

// 사용자 관리 서비스
export class UserManagementService {
  // 친구 사용자 목록 조회
  static async getFriendUsers(): Promise<FriendUser[]> {
    return api.get<FriendUser[]>('/api/v1/users/friends');
  }

  // 사용자 상세 정보 조회
  static async getFriendUser(userId: string): Promise<FriendUser> {
    return api.get<FriendUser>(`/api/v1/users/friends/${userId}`);
  }

  // 새 친구 사용자 초대
  static async inviteFriend(data: {
    email: string;
    display_name: string;
    vm_quota: FriendUser['vm_quota'];
  }): Promise<FriendUser> {
    return api.post<FriendUser>('/api/v1/users/friends/invite', data);
  }

  // 사용자 상태 변경
  static async updateUserStatus(
    userId: string,
    status: FriendUser['status']
  ): Promise<FriendUser> {
    return api.put<FriendUser>(`/api/v1/users/friends/${userId}/status`, {
      status,
    });
  }

  // 사용자 할당량 업데이트
  static async updateUserQuota(
    userId: string,
    quota: FriendUser['vm_quota']
  ): Promise<FriendUser> {
    return api.put<FriendUser>(`/api/v1/users/friends/${userId}/quota`, quota);
  }

  // 사용자 삭제
  static async deleteFriendUser(userId: string): Promise<void> {
    return api.delete<void>(`/api/v1/users/friends/${userId}`);
  }
}
