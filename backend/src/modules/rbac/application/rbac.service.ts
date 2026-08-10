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

  /** T051.00 — same tenant-ownership requirement as `assignRoleToUser`. Not currently wired to any
   * controller route, but fixed alongside its sibling so a future caller cannot reintroduce the
   * same cross-tenant gap by construction. */
  async removeRoleFromUser(
    userId: string,
    roleId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.getRole(roleId, actor.organizationId);
    await this.assertUserInOrganization(userId, actor.organizationId);
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

  async getPermissionCodesForUser(userId: string): Promise<string[]> {
    return this.roleRepository.getPermissionCodesForUser(userId);
  }
}
