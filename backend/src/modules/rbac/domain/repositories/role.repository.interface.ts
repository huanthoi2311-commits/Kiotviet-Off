import { RoleEntity, RoleWithPermissions } from '../entities/role.entity';

export interface CreateRoleInput {
  organizationId: string;
  code: string;
  name: string;
  description?: string;
}

export interface IRoleRepository {
  create(input: CreateRoleInput): Promise<RoleEntity>;
  findById(id: string): Promise<RoleWithPermissions | null>;
  findByCode(organizationId: string, code: string): Promise<RoleEntity | null>;
  list(organizationId: string): Promise<RoleEntity[]>;
  replacePermissions(roleId: string, permissionIds: string[]): Promise<void>;
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  removeRoleFromUser(userId: string, roleId: string): Promise<void>;
  getRoleCodesForUser(userId: string): Promise<string[]>;
  getPermissionCodesForUser(userId: string): Promise<string[]>;
  /** JWT cache quyền theo permissionVersion — tăng version để buộc access token cũ hết hiệu lực. */
  incrementPermissionVersionForUser(userId: string): Promise<void>;
  incrementPermissionVersionForUsersWithRole(roleId: string): Promise<void>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
