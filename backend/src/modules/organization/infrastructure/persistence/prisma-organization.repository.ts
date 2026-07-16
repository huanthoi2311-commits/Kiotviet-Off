import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PERMISSION_CATALOG } from '../../../rbac/infrastructure/permission-catalog';
import {
  OrganizationAggregate,
  OrganizationEntity,
  OrganizationSettingsEntity,
  OrganizationSubscriptionEntity,
} from '../../domain/entities/organization.entity';
import {
  AuditContext,
  CreateOrganizationWithOwnerInput,
  IOrganizationRepository,
  OrganizationEmailConflictError,
  OrganizationNotActiveError,
  OrganizationOwnerNotInOrganizationError,
  OrganizationSearchParams,
  OrganizationSearchResult,
  OrganizationSlugConflictError,
  OrganizationTaxCodeConflictError,
  UpdateOrganizationInput,
} from '../../domain/repositories/organization.repository.interface';

type RawOrganization = Prisma.OrganizationGetPayload<Record<string, never>>;
type RawSettings = Prisma.OrganizationSettingsGetPayload<Record<string, never>>;
type RawSubscription = Prisma.OrganizationSubscriptionGetPayload<
  Record<string, never>
>;

const OWNER_ROLE_CODE = 'owner';

@Injectable()
export class PrismaOrganizationRepository implements IOrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithOwner(
    input: CreateOrganizationWithOwnerInput,
    actorUserId: string,
    auditContext: AuditContext,
  ): Promise<OrganizationAggregate> {
    try {
      return await this.runCreateWithOwner(input, actorUserId, auditContext);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = (error.meta?.target as string[] | undefined) ?? [];
        if (target.includes('slug')) {
          throw new OrganizationSlugConflictError(input.slug);
        }
        if (target.includes('taxCode') && input.taxCode) {
          throw new OrganizationTaxCodeConflictError(input.taxCode);
        }
      }
      throw error;
    }
  }

  private async runCreateWithOwner(
    input: CreateOrganizationWithOwnerInput,
    actorUserId: string,
    auditContext: AuditContext,
  ): Promise<OrganizationAggregate> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          code: input.code,
          displayName: input.displayName,
          legalName: input.legalName ?? null,
          slug: input.slug,
          taxCode: input.taxCode ?? null,
          createdBy: actorUserId,
        },
      });

      const owner = await tx.user.create({
        data: {
          organizationId: organization.id,
          username: input.owner.username,
          fullName: input.owner.fullName,
          email: input.owner.email,
          passwordHash: input.owner.passwordHash,
          createdBy: actorUserId,
        },
      });

      await tx.organization.update({
        where: { id: organization.id },
        data: { ownerUserId: owner.id },
      });

      const ownerRole = await tx.role.create({
        data: {
          organizationId: organization.id,
          code: OWNER_ROLE_CODE,
          name: 'Chủ sở hữu',
          isSystem: true,
          createdBy: actorUserId,
        },
      });

      // Owner có toàn bộ quyền hệ thống ngay khi tạo — tổ chức mới chưa có user nào khác.
      const permissions = await tx.permission.findMany({
        where: { code: { in: PERMISSION_CATALOG.map((p) => p.code) } },
      });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: ownerRole.id,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }

      await tx.userRole.create({
        data: { userId: owner.id, roleId: ownerRole.id },
      });

      const settings = await tx.organizationSettings.create({
        data: { organizationId: organization.id },
      });

      const subscription = await tx.organizationSubscription.create({
        data: { organizationId: organization.id },
      });

      // Audit Log là bước bắt buộc NẰM TRONG transaction (SPEC-ORG-001 §17) — khác quy ước
      // AuditLogService (best-effort, ngoài transaction) dùng ở các module khác, vì Prompt
      // này yêu cầu rõ "nếu 1 bước lỗi → rollback toàn bộ" bao gồm cả Audit Log.
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: actorUserId,
          action: 'organization.created',
          entityType: 'Organization',
          entityId: organization.id,
          newValue: {
            code: organization.code,
            displayName: organization.displayName,
            slug: organization.slug,
            ownerUserId: owner.id,
          },
          ip: auditContext.ip ?? null,
          userAgent: auditContext.userAgent ?? null,
        },
      });

      return {
        organization: this.toEntity({ ...organization, ownerUserId: owner.id }),
        settings: this.toSettingsEntity(settings),
        subscription: this.toSubscriptionEntity(subscription),
      };
    });
  }

  async findById(id: string): Promise<OrganizationAggregate | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!organization) return null;

    const [settings, subscription] = await Promise.all([
      this.prisma.organizationSettings.findUnique({
        where: { organizationId: id },
      }),
      this.prisma.organizationSubscription.findUnique({
        where: { organizationId: id },
      }),
    ]);
    if (!settings || !subscription) return null;

    return {
      organization: this.toEntity(organization),
      settings: this.toSettingsEntity(settings),
      subscription: this.toSubscriptionEntity(subscription),
    };
  }

  async findBySlug(slug: string): Promise<OrganizationEntity | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { slug },
    });
    return organization ? this.toEntity(organization) : null;
  }

  async search(
    params: OrganizationSearchParams,
  ): Promise<OrganizationSearchResult> {
    const where: Prisma.OrganizationWhereInput = {
      status: params.status,
      ...(params.search
        ? {
            OR: [
              { displayName: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async update(
    id: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationEntity> {
    try {
      const organization = await this.prisma.organization.update({
        where: { id },
        data: {
          displayName: input.displayName,
          legalName: input.legalName,
          taxCode: input.taxCode,
          email: input.email,
          phone: input.phone,
          website: input.website,
          logoUrl: input.logoUrl,
          address: input.address,
          province: input.province,
          district: input.district,
          ward: input.ward,
          countryCode: input.countryCode,
          timezone: input.timezone,
          currencyCode: input.currencyCode,
          languageCode: input.languageCode,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(organization);
    } catch (error) {
      throw this.mapUniqueConstraintError(error, input);
    }
  }

  async archive(id: string, archivedBy: string): Promise<OrganizationEntity> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.organization.findUnique({ where: { id } });
      if (!current || current.status === 'ARCHIVED') {
        throw new OrganizationNotActiveError(id);
      }

      const organization = await tx.organization.update({
        where: { id },
        data: { status: 'ARCHIVED', updatedBy: archivedBy },
      });
      // "Archive → Tự động Disable Login" (SPEC-ORG-001 Rule 5) — vô hiệu hóa toàn bộ user.
      await tx.user.updateMany({
        where: { organizationId: id },
        data: { status: 'INACTIVE' },
      });
      return this.toEntity(organization);
    });
  }

  async transferOwner(
    id: string,
    newOwnerUserId: string,
    updatedBy: string,
  ): Promise<OrganizationEntity> {
    const newOwner = await this.prisma.user.findUnique({
      where: { id: newOwnerUserId },
    });
    if (!newOwner || newOwner.organizationId !== id) {
      throw new OrganizationOwnerNotInOrganizationError(newOwnerUserId);
    }

    const organization = await this.prisma.organization.update({
      where: { id },
      data: { ownerUserId: newOwnerUserId, updatedBy },
    });
    return this.toEntity(organization);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.prisma.organization.count({ where: { slug } });
    return count > 0;
  }

  async existsByTaxCode(taxCode: string): Promise<boolean> {
    const count = await this.prisma.organization.count({ where: { taxCode } });
    return count > 0;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.prisma.organization.count({ where: { email } });
    return count > 0;
  }

  private mapUniqueConstraintError(
    error: unknown,
    input: UpdateOrganizationInput,
  ): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      if (target.includes('taxCode') && input.taxCode) {
        return new OrganizationTaxCodeConflictError(input.taxCode);
      }
      if (target.includes('email') && input.email) {
        return new OrganizationEmailConflictError(input.email);
      }
    }
    return error as Error;
  }

  private toEntity(organization: RawOrganization): OrganizationEntity {
    return {
      id: organization.id,
      code: organization.code,
      displayName: organization.displayName,
      legalName: organization.legalName,
      slug: organization.slug,
      taxCode: organization.taxCode,
      email: organization.email,
      phone: organization.phone,
      website: organization.website,
      logoUrl: organization.logoUrl,
      address: organization.address,
      province: organization.province,
      district: organization.district,
      ward: organization.ward,
      countryCode: organization.countryCode,
      timezone: organization.timezone,
      currencyCode: organization.currencyCode,
      languageCode: organization.languageCode,
      status: organization.status,
      ownerUserId: organization.ownerUserId,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    };
  }

  private toSettingsEntity(settings: RawSettings): OrganizationSettingsEntity {
    return {
      organizationId: settings.organizationId,
      allowNegativeInventory: settings.allowNegativeInventory,
      allowBackDate: settings.allowBackDate,
      decimalQuantity: settings.decimalQuantity,
      decimalPrice: settings.decimalPrice,
      defaultWarehouseId: settings.defaultWarehouseId,
      defaultBranchId: settings.defaultBranchId,
      defaultLanguage: settings.defaultLanguage,
      defaultCurrency: settings.defaultCurrency,
    };
  }

  private toSubscriptionEntity(
    subscription: RawSubscription,
  ): OrganizationSubscriptionEntity {
    return {
      organizationId: subscription.organizationId,
      plan: subscription.plan,
      status: subscription.status,
      startedAt: subscription.startedAt,
      expiredAt: subscription.expiredAt,
      maxBranch: subscription.maxBranch,
      maxUser: subscription.maxUser,
      maxWarehouse: subscription.maxWarehouse,
      maxProduct: subscription.maxProduct,
      maxCustomer: subscription.maxCustomer,
      storageLimitGB: subscription.storageLimitGB,
    };
  }
}
