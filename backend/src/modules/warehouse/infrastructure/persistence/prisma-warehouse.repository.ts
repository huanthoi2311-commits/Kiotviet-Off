import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { WarehouseEntity } from '../../domain/entities/warehouse.entity';
import {
  CreateWarehouseInput,
  IWarehouseRepository,
  UpdateWarehouseInput,
  WarehouseSearchParams,
  WarehouseSearchResult,
} from '../../domain/repositories/warehouse.repository.interface';

type RawWarehouse = Prisma.WarehouseGetPayload<Record<string, never>>;

@Injectable()
export class PrismaWarehouseRepository implements IWarehouseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWarehouseInput): Promise<WarehouseEntity> {
    try {
      const warehouse = await this.prisma.warehouse.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          managerId: input.managerId ?? null,
          code: input.code,
          name: input.name,
          type: input.type ?? 'MAIN',
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          description: input.description ?? null,
          status: input.status ?? 'ACTIVE',
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
      });
      return this.toEntity(warehouse);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<WarehouseEntity | null> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    return warehouse ? this.toEntity(warehouse) : null;
  }

  async findByIdIncludingDeleted(
    id: string,
    organizationId: string,
  ): Promise<WarehouseEntity | null> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
    });
    return warehouse ? this.toEntity(warehouse) : null;
  }

  async update(
    id: string,
    input: UpdateWarehouseInput,
  ): Promise<WarehouseEntity> {
    try {
      const warehouse = await this.prisma.warehouse.update({
        where: { id },
        data: {
          branchId: input.branchId,
          managerId: input.managerId,
          code: input.code,
          name: input.name,
          type: input.type,
          address: input.address,
          phone: input.phone,
          email: input.email,
          description: input.description,
          status: input.status,
          updatedBy: input.updatedBy,
        },
      });
      return this.toEntity(warehouse);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async restore(id: string, restoredBy: string): Promise<void> {
    await this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: null, updatedBy: restoredBy },
    });
  }

  async search(params: WarehouseSearchParams): Promise<WarehouseSearchResult> {
    const where: Prisma.WarehouseWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      branchId: params.branchId,
      type: params.type,
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
      this.prisma.warehouse.findMany({
        where,
        orderBy: { [params.sortBy]: params.sortOrder },
        skip,
        take: params.limit,
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(
    organizationId: string,
    code: string,
    excludeId?: string,
  ): Promise<boolean> {
    const found = await this.prisma.warehouse.findFirst({
      where: {
        organizationId,
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return !!found;
  }

  async hasStockOrTransactions(warehouseId: string): Promise<boolean> {
    const [stockRow, historyRow] = await Promise.all([
      this.prisma.inventory.findFirst({
        where: {
          warehouseId,
          deletedAt: null,
          OR: [{ quantity: { not: 0 } }, { reservedQty: { not: 0 } }],
        },
        select: { id: true },
      }),
      this.prisma.inventoryHistory.findFirst({
        where: { warehouseId },
        select: { id: true },
      }),
    ]);
    return !!stockRow || !!historyRow;
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target =
          (error.meta?.target as string[] | undefined)?.join(', ') ??
          'trường dữ liệu';
        return new ConflictException(
          withCode(
            ErrorCode.WAREHOUSE_DUPLICATE,
            `Giá trị của "${target}" đã tồn tại`,
          ),
        );
      }
      if (error.code === 'P2003') {
        const field = (error.meta?.field_name as string | undefined) ?? '';
        const label = field.includes('branchId')
          ? 'branchId'
          : field.includes('managerId')
            ? 'managerId'
            : 'liên kết';
        return new BadRequestException(
          withCode(
            ErrorCode.VALIDATION_FAILED,
            `Giá trị "${label}" không tồn tại`,
          ),
        );
      }
    }
    return error as Error;
  }

  private toEntity(warehouse: RawWarehouse): WarehouseEntity {
    return {
      id: warehouse.id,
      organizationId: warehouse.organizationId,
      branchId: warehouse.branchId,
      managerId: warehouse.managerId,
      code: warehouse.code,
      name: warehouse.name,
      type: warehouse.type,
      address: warehouse.address,
      phone: warehouse.phone,
      email: warehouse.email,
      description: warehouse.description,
      status: warehouse.status,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
      deletedAt: warehouse.deletedAt,
    };
  }
}
