import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { applyInventoryDelta } from '../../../../common/utils/average-cost.util';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { StockCountEntity } from '../../domain/entities/stock-count.entity';
import {
  CompleteStockCountItemInput,
  CreateStockCountInput,
  IStockCountRepository,
  StockCountItemMismatchError,
  StockCountSearchParams,
  StockCountSearchResult,
  StockCountStatusConflictError,
} from '../../domain/repositories/stock-count.repository.interface';

const STOCK_COUNT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.StockCountInclude;

type StockCountWithItems = Prisma.StockCountGetPayload<{
  include: typeof STOCK_COUNT_INCLUDE;
}>;

@Injectable()
export class PrismaStockCountRepository implements IStockCountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStockCountInput): Promise<StockCountEntity> {
    try {
      const inventories = await this.prisma.inventory.findMany({
        where: {
          warehouseId: input.warehouseId,
          productId: { in: input.productIds },
          deletedAt: null,
        },
      });
      const qtyByProduct = new Map(
        inventories.map((inv) => [inv.productId, inv.quantity]),
      );

      const stockCount = await this.prisma.stockCount.create({
        data: {
          organizationId: input.organizationId,
          warehouseId: input.warehouseId,
          code: input.code,
          note: input.note ?? null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          items: {
            create: input.productIds.map((productId) => ({
              productId,
              systemQty: qtyByProduct.get(productId) ?? new Prisma.Decimal(0),
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            })),
          },
        },
        include: STOCK_COUNT_INCLUDE,
      });
      return this.toEntity(stockCount);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<StockCountEntity | null> {
    const stockCount = await this.prisma.stockCount.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: STOCK_COUNT_INCLUDE,
    });
    return stockCount ? this.toEntity(stockCount) : null;
  }

  async search(
    params: StockCountSearchParams,
  ): Promise<StockCountSearchResult> {
    const where: Prisma.StockCountWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      warehouseId: params.warehouseId,
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockCount.findMany({
        where,
        include: STOCK_COUNT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(organizationId: string, code: string): Promise<boolean> {
    const found = await this.prisma.stockCount.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return !!found;
  }

  async start(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<StockCountEntity> {
    const result = await this.prisma.stockCount.updateMany({
      where: { id, organizationId, status: 'DRAFT' },
      data: { status: 'COUNTING', updatedBy },
    });

    if (result.count === 0) {
      const current = await this.prisma.stockCount.findFirst({
        where: { id, organizationId },
        select: { status: true },
      });
      throw new StockCountStatusConflictError(current?.status ?? null);
    }

    const updated = await this.prisma.stockCount.findFirst({
      where: { id, organizationId },
      include: STOCK_COUNT_INCLUDE,
    });
    return this.toEntity(updated as StockCountWithItems);
  }

  async complete(
    id: string,
    organizationId: string,
    items: CompleteStockCountItemInput[],
    updatedBy: string,
  ): Promise<StockCountEntity> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.stockCount.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (!current || current.status !== 'COUNTING') {
        throw new StockCountStatusConflictError(current?.status ?? null);
      }

      const itemById = new Map(current.items.map((item) => [item.id, item]));

      for (const input of items) {
        const existingItem = itemById.get(input.itemId);
        if (!existingItem) {
          throw new StockCountItemMismatchError(input.itemId);
        }

        const actualQty = new Prisma.Decimal(input.actualQty);
        const difference = actualQty.minus(existingItem.systemQty);

        await tx.stockCountItem.update({
          where: { id: input.itemId },
          data: {
            actualQty,
            difference,
            remark: input.remark ?? null,
            updatedBy,
          },
        });

        if (!difference.isZero()) {
          const existingInventory = await tx.inventory.findUnique({
            where: {
              warehouseId_productId: {
                warehouseId: current.warehouseId,
                productId: existingItem.productId,
              },
            },
          });
          const beforeQuantity =
            existingInventory?.quantity ?? new Prisma.Decimal(0);
          const { afterQuantity, avgCost, lastCost } = applyInventoryDelta({
            beforeQuantity,
            beforeAvgCost: existingInventory?.avgCost ?? new Prisma.Decimal(0),
            delta: difference,
            unitCost: null,
          });
          const resolvedLastCost =
            lastCost ?? existingInventory?.lastCost ?? new Prisma.Decimal(0);

          await tx.inventory.upsert({
            where: {
              warehouseId_productId: {
                warehouseId: current.warehouseId,
                productId: existingItem.productId,
              },
            },
            create: {
              organizationId,
              warehouseId: current.warehouseId,
              productId: existingItem.productId,
              quantity: afterQuantity,
              reservedQty: 0,
              avgCost,
              lastCost: resolvedLastCost,
              createdBy: updatedBy,
              updatedBy,
            },
            update: {
              quantity: afterQuantity,
              avgCost,
              lastCost: resolvedLastCost,
              updatedBy,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              organizationId,
              warehouseId: current.warehouseId,
              productId: existingItem.productId,
              movementType: 'COUNT',
              referenceType: 'COUNT',
              referenceId: id,
              quantity: difference,
              beforeQuantity,
              afterQuantity,
              unitCost: null,
              remark: input.remark ?? null,
              createdBy: updatedBy,
            },
          });
        }
      }

      const updated = await tx.stockCount.update({
        where: { id },
        data: { status: 'COMPLETED', updatedBy },
        include: STOCK_COUNT_INCLUDE,
      });

      return this.toEntity(updated);
    });
  }

  private translateWriteError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        withCode(
          ErrorCode.STOCK_COUNT_DUPLICATE,
          'Mã phiếu kiểm kê đã tồn tại',
        ),
      );
    }
    return error as Error;
  }

  private toEntity(stockCount: StockCountWithItems): StockCountEntity {
    return {
      id: stockCount.id,
      organizationId: stockCount.organizationId,
      warehouseId: stockCount.warehouseId,
      code: stockCount.code,
      status: stockCount.status,
      note: stockCount.note,
      createdAt: stockCount.createdAt,
      updatedAt: stockCount.updatedAt,
      deletedAt: stockCount.deletedAt,
      items: stockCount.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        systemQty: item.systemQty.toString(),
        actualQty: item.actualQty?.toString() ?? null,
        difference: item.difference?.toString() ?? null,
        remark: item.remark,
      })),
    };
  }
}
