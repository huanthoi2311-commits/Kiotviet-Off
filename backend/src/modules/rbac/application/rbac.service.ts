import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { withCode } from '../../../common/errors/with-code';
import { ErrorCode } from '../../../common/errors/error-codes';
import {
  RoleEntity,
  RoleWithPermissions,
} from '../domain/entities/role.entity';
import { PermissionEntity } from '../domain/entities/permission.entity';
import { ROLE_REPOSITORY } from '../domain/repositories/role.repository.interface';
import type { IRoleRepository } from '../domain/repositories/role.repository.interface';
import { PERMISSION_REPOSITORY } from '../domain/repositories/permission.repository.interface';
import type { IPermissionRepository } from '../domain/repositories/permission.repository.interface';

export interface ActorContext {
  userId: string;
  organizationId: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class RbacService {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roleRepository: IRoleRepository,
    @Inject(PERMISSION_REPOSITORY)
    private readonly permissionRepository: IPermissionRepository,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listPermissions(): Promise<PermissionEntity[]> {
    return this.permissionRepository.list();
  }

  async listRoles(organizationId: string): Promise<RoleEntity[]> {
    return this.roleRepository.list(organizationId);
  }

  /** T051.00 — organizationId is mandatory: a role belonging to another organization must read
   * as not-found (same response as a genuinely missing role), never leaked cross-tenant. */
  async getRole(
    id: string,
    organizationId: string,
  ): Promise<RoleWithPermissions> {
    const role = await this.roleRepository.findById(id, organizationId);
    if (!role) {
      throw new NotFoundException(
        withCode(ErrorCode.RBAC_ROLE_NOT_FOUND, 'Không tìm thấy vai trò'),
      );
    }
    return role;
  }

  async createRole(
    organizationId: string,
    input: { code: string; name: string; description?: string },
  ): Promise<RoleEntity> {
    const existing = await this.roleRepository.findByCode(
      organizationId,
      input.code,
    );
    if (existing) {
      throw new ConflictException(
        withCode(ErrorCode.RBAC_ROLE_CODE_CONFLICT, 'Mã vai trò đã tồn tại'),
      );
    }
    return this.roleRepository.create({ organizationId, ...input });
  }

  /** T051.00 — `actor` is now mandatory (was optional): `actor.organizationId` is the sole source
   * of tenant scoping for this mutation, not just audit metadata. A role belonging to another
   * organization throws the same `RBAC_ROLE_NOT_FOUND` as a genuinely missing role. */
  async assignPermissions(
    roleId: string,
    permissionCodes: string[],
    actor: ActorContext,
  ): Promise<RoleWithPermissions> {
    const before = await this.getRole(roleId, actor.organizationId);
    const permissions =
      await this.permissionRepository.findByCodes(permissionCodes);
    if (permissions.length !== new Set(permissionCodes).size) {
      throw new NotFoundException(
        withCode(
          ErrorCode.RBAC_PERMISSION_CODE_INVALID,
          'Một hoặc nhiều permission code không tồn tại',
        ),
      );
    }

    await this.assertOwnerRetainsRoleUpdateAfterPermissionChange(
      actor.organizationId,
      roleId,
      before.code,
      permissionCodes,
    );

    await this.roleRepository.replacePermissions(
      roleId,
      permissions.map((p) => p.id),
    );
    // Người giữ role này đang có JWT nhúng sẵn quyền cũ — bump version để buộc login lại.
    await this.roleRepository.incrementPermissionVersionForUsersWithRole(
      roleId,
    );

    const after = await this.getRole(roleId, actor.organizationId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'role.permissions.update',
      entityType: 'Role',
      entityId: roleId,
      oldValue: { permissionCodes: before.permissionCodes },
      newValue: { permissionCodes: after.permissionCodes },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return after;
  }

  /** T051.00 — `actor` is now mandatory: both the role and the target user must belong to
   * `actor.organizationId`. A cross-tenant role or user reads as not-found, same as a genuinely
   * missing one — never a different error that would leak cross-tenant existence. */
  async assignRoleToUser(
    userId: string,
    roleId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.getRole(roleId, actor.organizationId);
    await this.assertUserInOrganization(userId, actor.organizationId);
    await this.roleRepository.assignRoleToUser(userId, roleId);

    await this.auditLogService.log({
      organizationId: actor.organizationId,
      userId: actor.userId,
      action: 'user.role.assign',
      entityType: 'User',
      entityId: userId,
      newValue: { roleId },
      ip: actor.ip,
      userAgent: actor.userAgent,
    });
  }

  /** T051.00 — same tenant-ownership requirement as `assignRoleToUser`.
   * T052.03B — now wired to `DELETE /roles/:roleId/users/:userId`; protected by the same
   * owner-lockout invariant as `assignPermissions`. */
  async removeRoleFromUser(
    userId: string,
    roleId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.getRole(roleId, actor.organizationId);
    await this.assertUserInOrganization(userId, actor.organizationId);

    if (userId === (await this.getOwnerUserId(actor.organizationId))) {
      const ownerRoleCodes =
        await this.roleRepository.getRoleCodesForUser(userId);
      await this.assertOwnerRetainsRoleUpdate(
        actor.organizationId,
        ownerRoleCodes,
        roleId,
        [], // simulates the role being fully removed from the owner
      );
    }

    await this.roleRepository.removeRoleFromUser(userId, roleId);
  }

  private async assertUserInOrganization(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const userOrganizationId =
      await this.roleRepository.findOrganizationIdForUser(userId);
    if (userOrganizationId !== organizationId) {
      throw new NotFoundException(
        withCode(ErrorCode.RBAC_USER_NOT_FOUND, 'Không tìm thấy người dùng'),
      );
    }
  }

  /**
   * T052.03B §6 — Owner effective-permission algorithm, `assignPermissions` side. `roleCode` is
   * the target role's own code (`before.code`), already resolved by the caller so we don't refetch
   * it. Only runs the (more expensive) simulation when the owner actually holds the role being
   * mutated — if not, this mutation cannot possibly affect the owner's effective permissions, so
   * existing behavior continues unchanged (§6 step 3).
   */
  private async assertOwnerRetainsRoleUpdateAfterPermissionChange(
    organizationId: string,
    mutatedRoleId: string,
    mutatedRoleCode: string,
    newPermissionCodesForMutatedRole: string[],
  ): Promise<void> {
    const ownerUserId = await this.getOwnerUserId(organizationId);
    const ownerRoleCodes =
      await this.roleRepository.getRoleCodesForUser(ownerUserId);
    if (!ownerRoleCodes.includes(mutatedRoleCode)) {
      return;
    }
    await this.assertOwnerRetainsRoleUpdate(
      organizationId,
      ownerRoleCodes,
      mutatedRoleId,
      newPermissionCodesForMutatedRole,
    );
  }

  /**
   * T052.03B §6 — shared core of the owner effective-permission algorithm, reused by both
   * `assignPermissions` (role permissions replaced) and `removeRoleFromUser` (role removed from
   * owner entirely, modeled as "replaced by an empty permission set"). For every role the owner
   * currently holds, sums up permission codes — using `newPermissionCodesForChangedRole` in place
   * of `changedRoleId`'s real (pre-mutation) permissions, and each other role's real, current
   * permissions untouched. Rejects only if `role:update` would be absent from every remaining
   * effective owner role (§6: never by role code/name/`isSystem` alone).
   */
  private async assertOwnerRetainsRoleUpdate(
    organizationId: string,
    ownerRoleCodes: string[],
    changedRoleId: string,
    newPermissionCodesForChangedRole: string[],
  ): Promise<void> {
    const effectivePermissionCodes = new Set<string>();
    for (const roleCode of ownerRoleCodes) {
      const role = await this.roleRepository.findByCode(
        organizationId,
        roleCode,
      );
      if (!role) continue;
      if (role.id === changedRoleId) {
        newPermissionCodesForChangedRole.forEach((code) =>
          effectivePermissionCodes.add(code),
        );
        continue;
      }
      const roleWithPermissions = await this.roleRepository.findById(
        role.id,
        organizationId,
      );
      roleWithPermissions?.permissionCodes.forEach((code) =>
        effectivePermissionCodes.add(code),
      );
    }

    if (!effectivePermissionCodes.has('role:update')) {
      throw new ConflictException(
        withCode(
          ErrorCode.RBAC_OWNER_PERMISSION_REQUIRED,
          'Thao tác sẽ khiến chủ sở hữu tổ chức mất quyền role:update — không thể thực hiện',
        ),
      );
    }
  }

  /**
   * T052.03B — RBAC POLICY READ PORT consumer (Architect decision, round-2 module-cycle
   * resolution, option Q4). `organizationId` MUST come from `actor.organizationId` (an
   * already-authenticated, tenant-scoped JWT claim) — never from client-controlled input. A valid
   * organizationId must always resolve to an owner; if it doesn't, this is an invariant violation
   * (not a "not found" case) and must NOT silently skip owner protection — surfaced as a plain
   * `Error` so it reaches `HttpExceptionFilter`'s generic, already-established uncaught-exception
   * path (logged server-side, generic 500 to the client), rather than inventing a new/misleading
   * 404 for the RBAC target.
   */
  private async getOwnerUserId(organizationId: string): Promise<string> {
    const ownerUserId =
      await this.roleRepository.findOrganizationOwnerUserId(organizationId);
    if (!ownerUserId) {
      throw new Error(
        `RBAC invariant violation: no resolvable owner for organization ${organizationId}`,
      );
    }
    return ownerUserId;
  }

  async getPermissionCodesForUser(userId: string): Promise<string[]> {
    return this.roleRepository.getPermissionCodesForUser(userId);
  }

  /**
   * T052.02 — smallest addition needed for `GET /users/:id` to display a user's current roles.
   * `IRoleRepository.getRoleCodesForUser` already existed (used nowhere at the service layer
   * before this) — this just adds the SAME tenant check already established for
   * `assignRoleToUser`/`removeRoleFromUser`: a userId belonging to another organization must read
   * as not-found, never leaked. No new repository capability, no role CRUD added.
   */
  async getRoleCodesForUser(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    await this.assertUserInOrganization(userId, organizationId);
    return this.roleRepository.getRoleCodesForUser(userId);
  }
}
