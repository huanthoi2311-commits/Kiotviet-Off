import { RoleEntity, RoleWithPermissions } from '../entities/role.entity';

export interface CreateRoleInput {
  organizationId: string;
  code: string;
  name: string;
  description?: string;
}

export interface IRoleRepository {
  create(input: CreateRoleInput): Promise<RoleEntity>;
  /** T051.00 — scoped by organizationId: a role belonging to another organization must read as
   * not-found, never leaked or mutable cross-tenant. */
  findById(
    id: string,
    organizationId: string,
  ): Promise<RoleWithPermissions | null>;
  findByCode(organizationId: string, code: string): Promise<RoleEntity | null>;
  list(organizationId: string): Promise<RoleEntity[]>;
  replacePermissions(roleId: string, permissionIds: string[]): Promise<void>;
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  removeRoleFromUser(userId: string, roleId: string): Promise<void>;
  getRoleCodesForUser(userId: string): Promise<string[]>;
  getPermissionCodesForUser(userId: string): Promise<string[]>;
  /** T051.00 — resolves the organization a user belongs to, so the service layer can verify a
   * role-assignment target user is in the caller's own organization before mutating. */
  findOrganizationIdForUser(userId: string): Promise<string | null>;
  /** JWT cache quyền theo permissionVersion — tăng version để buộc access token cũ hết hiệu lực. */
  incrementPermissionVersionForUser(userId: string): Promise<void>;
  incrementPermissionVersionForUsersWithRole(roleId: string): Promise<void>;
  /**
   * T052.03B — RBAC POLICY READ PORT (Architect-approved cross-table read, round-2 module-cycle
   * decision, option Q4): RBAC owns the owner-lockout safety invariant and needs
   * `Organization.ownerUserId` to enforce it, but `RbacModule` cannot import `OrganizationModule`
   * (would recreate the `RbacModule -> OrganizationModule -> AuthModule -> RbacModule` cycle found
   * during P1). This is a narrow, read-only, organizationId-scoped lookup of a single column — NOT
   * a general Organization repository capability. Do not extend this to read any other
   * Organization field. Returns null both when the Organization row cannot be found AND when
   * `ownerUserId` is legitimately null (bootstrap window before the owner user exists) — callers
   * MUST treat null as an invariant failure for any already-authenticated actor, never as "skip
   * the check".
   */
  findOrganizationOwnerUserId(organizationId: string): Promise<string | null>;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
