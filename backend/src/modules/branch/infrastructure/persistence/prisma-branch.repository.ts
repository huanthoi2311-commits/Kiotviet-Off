import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BranchEntity } from '../../domain/entities/branch.entity';
import {
  BranchHasActiveWarehouseError,
  BranchInvoicePrefixConflictError,
  BranchNotActiveError,
  BranchOrganizationMinOneActiveError,
  BranchSearchParams,
  BranchSearchResult,
  CreateBranchInput,
  IBranchRepository,
  UpdateBranchInput,
} from '../../domain/repositories/branch.repository.interface';

type RawBranch = Prisma.BranchGetPayload<Record<string, never>>;

@Injectable()
export class PrismaBranchRepository implements IBranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBranchInput): Promise<BranchEntity> {
    try {
      const branch = await this.prisma.branch.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          name: input.name,
          email: input.email ?? null,
          address: input.address ?? null,
          province: input.province ?? null,
          district: input.district ?? null,
          ward: input.ward ?? null,
          phone: input.phone ?? null,
          invoicePrefix: input.invoicePrefix ?? null,
          receiptPrefix: input.receiptPrefix ?? null,
          timezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
          currencyCode: input.currencyCode ?? 'VND',
          managerUserId: input.managerUserId ?? null,
          createdBy: input.createdBy,
        },
      });
      return this.toEntity(branch);
    } catch (error) {
      throw this.mapUniqueConstraintError(error, input.invoicePrefix);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<BranchEntity | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { id, organizationId },
    });
    return branch ? this.toEntity(branch) : null;
  }

  async search(params: BranchSearchParams): Promise<BranchSearchResult> {
    const where: Prisma.BranchWhereInput = {
      organizationId: params.organizationId,
      status: params.status,
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /** Service phải gọi findById(id, organizationId) trước để xác nhận tồn tại + đúng tenant. */
  async update(
    id: string,
    _organizationId: string,
    input: UpdateBranchInput,
  ): Promise<BranchEntity> {
    try {
      const branch = await this.prisma.branch.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          address: input.address,
          province: input.province,
          district: input.district,
          ward: input.ward,
          phone: input.phone,
          invoicePrefix: input.invoicePrefix,
          receiptPrefix: input.receiptPrefix,
          timezone: input.timezone,
          currencyCode: input.currencyCode,
          managerUserId: input.managerUserId,
          defaultWarehouseId: input.defaultWarehouseId,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(branch);
    } catch (error) {
      throw this.mapUniqueConstraintError(error, input.invoicePrefix);
    }
  }

  async archive(
    id: string,
    organizationId: string,
    archivedBy: string,
  ): Promise<BranchEntity> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.branch.findFirst({
        where: { id, organizationId },
      });
      if (!current || current.status === 'ARCHIVED') {
        throw new BranchNotActiveError(id);
      }

      const activeWarehouseCount = await tx.warehouse.count({
        where: { branchId: id, status: 'ACTIVE', deletedAt: null },
      });
      if (activeWarehouseCount > 0) {
        throw new BranchHasActiveWarehouseError(id);
      }

      const otherActiveBranches = await tx.branch.count({
        where: {
          organizationId,
          status: 'ACTIVE',
          id: { not: id },
        },
      });
      if (otherActiveBranches === 0) {
        throw new BranchOrganizationMinOneActiveError(organizationId);
      }

      const branch = await tx.branch.update({
        where: { id },
        data: { status: 'ARCHIVED', isMain: false, updatedBy: archivedBy },
      });
      return this.toEntity(branch);
    });
  }

  /** Service phải gọi findById(id, organizationId) trước để xác nhận tồn tại + đúng tenant. */
  async setDefault(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<BranchEntity> {
    return this.prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({
        where: { organizationId, isMain: true, id: { not: id } },
        data: { isMain: false, updatedBy },
      });
      const branch = await tx.branch.update({
        where: { id },
        data: { isMain: true, updatedBy },
      });
      return this.toEntity(branch);
    });
  }

  async existsByInvoicePrefix(
    organizationId: string,
    invoicePrefix: string,
  ): Promise<boolean> {
    const count = await this.prisma.branch.count({
      where: { organizationId, invoicePrefix },
    });
    return count > 0;
  }

  async countActiveByOrganization(organizationId: string): Promise<number> {
    return this.prisma.branch.count({
      where: { organizationId, status: 'ACTIVE' },
    });
  }

  private mapUniqueConstraintError(
    error: unknown,
    invoicePrefix: string | null | undefined,
  ): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      invoicePrefix
    ) {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      if (target.includes('invoicePrefix')) {
        return new BranchInvoicePrefixConflictError(invoicePrefix);
      }
    }
    return error as Error;
  }

  private toEntity(branch: RawBranch): BranchEntity {
    return {
      id: branch.id,
      organizationId: branch.organizationId,
      managerUserId: branch.managerUserId,
      defaultWarehouseId: branch.defaultWarehouseId,
      code: branch.code,
      name: branch.name,
      email: branch.email,
      address: branch.address,
      province: branch.province,
      district: branch.district,
      ward: branch.ward,
      phone: branch.phone,
      invoicePrefix: branch.invoicePrefix,
      receiptPrefix: branch.receiptPrefix,
      timezone: branch.timezone,
      currencyCode: branch.currencyCode,
      isMain: branch.isMain,
      status: branch.status,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }
}
