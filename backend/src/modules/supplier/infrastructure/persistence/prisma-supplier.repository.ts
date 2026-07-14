import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { SupplierEntity } from '../../domain/entities/supplier.entity';
import {
  CreateSupplierInput,
  ImportSupplierResult,
  ImportSupplierRow,
  ISupplierRepository,
  SupplierSearchParams,
  SupplierSearchResult,
  UpdateSupplierInput,
} from '../../domain/repositories/supplier.repository.interface';

type RawSupplier = Prisma.SupplierGetPayload<Record<string, never>>;

@Injectable()
export class PrismaSupplierRepository implements ISupplierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSupplierInput): Promise<SupplierEntity> {
    try {
      const supplier = await this.prisma.supplier.create({
        data: {
          organizationId: input.organizationId,
          code: input.code,
          taxCode: input.taxCode ?? null,
          companyName: input.companyName,
          contactName: input.contactName ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          website: input.website ?? null,
          address: input.address ?? null,
          province: input.province ?? null,
          district: input.district ?? null,
          ward: input.ward ?? null,
          bankName: input.bankName ?? null,
          bankAccount: input.bankAccount ?? null,
          paymentTerm: input.paymentTerm ?? null,
          creditLimit: input.creditLimit ?? null,
          status: input.status ?? 'ACTIVE',
          note: input.note ?? null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(supplier);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<SupplierEntity | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return supplier ? this.toEntity(supplier) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<SupplierEntity | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });
    return supplier ? this.toEntity(supplier) : null;
  }

  async update(
    id: string,
    input: UpdateSupplierInput,
  ): Promise<SupplierEntity> {
    try {
      const supplier = await this.prisma.supplier.update({
        where: { id },
        data: {
          code: input.code,
          taxCode: input.taxCode,
          companyName: input.companyName,
          contactName: input.contactName,
          phone: input.phone,
          email: input.email,
          website: input.website,
          address: input.address,
          province: input.province,
          district: input.district,
          ward: input.ward,
          bankName: input.bankName,
          bankAccount: input.bankAccount,
          paymentTerm: input.paymentTerm,
          creditLimit: input.creditLimit,
          status: input.status,
          note: input.note,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(supplier);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: null, updatedBy: restoredBy },
    });
  }

  async search(params: SupplierSearchParams): Promise<SupplierSearchResult> {
    const where = this.buildWhere(params);
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async findAllForExport(
    params: Omit<SupplierSearchParams, 'page' | 'limit'>,
  ): Promise<SupplierEntity[]> {
    const where = this.buildWhere(params);
    const items = await this.prisma.supplier.findMany({
      where,
      orderBy: { [params.sortBy]: params.sortOrder },
    });
    return items.map((item) => this.toEntity(item));
  }

  async existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.supplier.findFirst({
      where: {
        organizationId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  async hasPurchaseOrders(supplierId: string): Promise<boolean> {
    const found = await this.prisma.purchaseOrder.findFirst({
      where: { supplierId, deletedAt: null },
      select: { id: true },
    });
    return !!found;
  }

  async importBatch(
    organizationId: string,
    rows: ImportSupplierRow[],
    actorId: string,
  ): Promise<ImportSupplierResult> {
    return this.prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const row of rows) {
        const existing = await tx.supplier.findFirst({
          where: { organizationId, code: row.code, deletedAt: null },
          select: { id: true },
        });

        const data = {
          taxCode: row.taxCode ?? null,
          companyName: row.companyName,
          contactName: row.contactName ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          website: row.website ?? null,
          address: row.address ?? null,
          province: row.province ?? null,
          district: row.district ?? null,
          ward: row.ward ?? null,
          bankName: row.bankName ?? null,
          bankAccount: row.bankAccount ?? null,
          paymentTerm: row.paymentTerm ?? null,
          creditLimit: row.creditLimit ?? null,
          status: row.status ?? 'ACTIVE',
          note: row.note ?? null,
        };

        if (existing) {
          await tx.supplier.update({
            where: { id: existing.id },
            data: { ...data, updatedBy: actorId },
          });
          updatedCount += 1;
        } else {
          await tx.supplier.create({
            data: {
              organizationId,
              code: row.code,
              ...data,
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
          createdCount += 1;
        }
      }

      return { createdCount, updatedCount };
    });
  }

  private buildWhere(
    params: Omit<
      SupplierSearchParams,
      'page' | 'limit' | 'sortBy' | 'sortOrder'
    >,
  ): Prisma.SupplierWhereInput {
    return {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      province: params.province,
      ...(params.search
        ? {
            OR: [
              { companyName: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
              { taxCode: { contains: params.search, mode: 'insensitive' } },
              { contactName: { contains: params.search, mode: 'insensitive' } },
              { phone: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private translateWriteError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target =
        (error.meta?.target as string[] | undefined)?.join(', ') ??
        'trường dữ liệu';
      return new ConflictException(
        withCode(
          ErrorCode.SUPPLIER_DUPLICATE,
          `Giá trị của "${target}" đã tồn tại`,
        ),
      );
    }
    return error as Error;
  }

  private toEntity(supplier: RawSupplier): SupplierEntity {
    return {
      id: supplier.id,
      organizationId: supplier.organizationId,
      code: supplier.code,
      taxCode: supplier.taxCode,
      companyName: supplier.companyName,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      website: supplier.website,
      address: supplier.address,
      province: supplier.province,
      district: supplier.district,
      ward: supplier.ward,
      bankName: supplier.bankName,
      bankAccount: supplier.bankAccount,
      paymentTerm: supplier.paymentTerm,
      creditLimit: supplier.creditLimit?.toString() ?? null,
      status: supplier.status,
      note: supplier.note,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
      deletedAt: supplier.deletedAt,
    };
  }
}
