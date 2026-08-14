import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  RoleEntity,
  RoleWithPermissions,
} from '../domain/entities/role.entity';
import {
  CreateRoleInput,
  IRoleRepository,
} from '../domain/repositories/role.repository.interface';

@Injectable()
export class PrismaRoleRepository implements IRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateRoleInput): Promise<RoleEntity> {
    try {
      const role = await this.prisma.role.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          name: input.name,
          description: input.description,
        },
      });
      return this.toEntity(role);
    } catch (error) {
      // T052.03B (D7) — pre-check trong RbacService.createRole() có race window giữa 2 request
      // đồng thời cùng code; đây là fallback ở tầng DB unique constraint để không lộ lỗi Prisma
      // thô (P2002 -> 500) khi race xảy ra. Cùng pattern PrismaBrandRepository.translateWriteError.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          withCode(ErrorCode.RBAC_ROLE_CODE_CONFLICT, 'Mã vai trò đã tồn tại'),
        );
      }
      throw error;
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<RoleWithPermissions | null> {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (!role) return null;
    return {
      ...this.toEntity(role),
      permissionCodes: role.rolePermissions.map((rp) => rp.permission.code),
    };
  }

  async findByCode(
    organizationId: string,
    code: string,
  ): Promise<RoleEntity | null> {
    const role = await this.prisma.role.findUnique({
      where: { organizationId_code: { organizationId, code } },
    });
    return role ? this.toEntity(role) : null;
  }

  async list(organizationId: string): Promise<RoleEntity[]> {
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
    });
    return roles.map((r) => this.toEntity(r));
  }

  async replacePermissions(
    roleId: string,
    permissionIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
    await this.incrementPermissionVersionForUser(userId);
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    await this.incrementPermissionVersionForUser(userId);
  }

  async incrementPermissionVersionForUser(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { permissionVersion: { increment: 1 } },
    });
  }

  async incrementPermissionVersionForUsersWithRole(
    roleId: string,
  ): Promise<void> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    if (userRoles.length === 0) return;
    await this.prisma.user.updateMany({
      where: { id: { in: userRoles.map((ur) => ur.userId) } },
      data: { permissionVersion: { increment: 1 } },
    });
  }

  async findOrganizationIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    return user?.organizationId ?? null;
  }

  /**
   * T052.03B — RBAC POLICY READ PORT. Direct, read-only, single-column query against
   * `Organization` scoped by `id = organizationId`. Deliberately bypasses the full Organization
   * aggregate/repository (`OrganizationModule`'s own `IOrganizationRepository`) — RBAC has no
   * business reading anything else on that aggregate, and importing that module would recreate
   * the module cycle rejected during T052.03B round 2.
   */
  async findOrganizationOwnerUserId(
    organizationId: string,
  ): Promise<string | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerUserId: true },
    });
    return organization?.ownerUserId ?? null;
  }

  async getRoleCodesForUser(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return userRoles.map((ur) => ur.role.code);
  }

  async getPermissionCodesForUser(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
    });
    const codes = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        codes.add(rolePermission.permission.code);
      }
    }
    return Array.from(codes);
  }

  private toEntity(role: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    isSystem: boolean;
    description: string | null;
  }): RoleEntity {
    return {
      id: role.id,
      organizationId: role.organizationId,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      description: role.description,
    };
  }
}
