export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

/** T052.02 — không expose `passwordHash`/`isPlatformAdmin`/`permissionVersion` ra khỏi tầng domain
 * trở lên (passwordHash không bao giờ trả về; isPlatformAdmin/permissionVersion không phải phạm
 * vi quản lý của module này — xem SPEC-ORG-001 Decision 4). */
export interface UserEntity {
  id: string;
  organizationId: string;
  branchId: string | null;
  username: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
