export type AuthUserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface AuthUserEntity {
  id: string;
  organizationId: string;
  branchId: string | null;
  email: string;
  username: string;
  passwordHash: string;
  status: AuthUserStatus;
  permissionVersion: number;
}
