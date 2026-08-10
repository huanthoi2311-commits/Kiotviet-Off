import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { StockCountEntity } from '../../domain/entities/stock-count.entity';
import {
  CompleteStockCountItemInput,
  CreateStockCountInput,
  IStockCountRepository,
  StockCountConcurrencyConflictError,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryDomainService: InventoryDomainService,
  ) {}

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

  /**
   * T051.02 — COUNTING → COMPLETED trong 1 transaction, Optimistic Lock CAS-FIRST: bước đầu tiên
   * là `updateMany({where:{id, organizationId, status:'COUNTING', version:expectedVersion}})` để
   * CLAIM quyền complete trước khi chạm vào Inventory. Request thua cuộc (0 dòng bị ảnh hưởng) ném
   * lỗi ngay tại đây — KHÔNG chạy vòng lặp Inventory bên dưới.
   */
  async complete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    items: CompleteStockCountItemInput[],
    updatedBy: string,
  ): Promise<StockCountEntity> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.stockCount.updateMany({
        where: {
          id,
          organizationId,
          status: 'COUNTING',
          version: expectedVersion,
        },
        data: { status: 'COMPLETED', version: { increment: 1 }, updatedBy },
      });

      if (claim.count === 0) {
        const current = await tx.stockCount.findFirst({
          where: { id, organizationId },
          select: { status: true, version: true },
        });
        if (!current) {
          throw new StockCountStatusConflictError(null);
        }
        // T051.02: version lệch => request khác đã ghi đè kể từ lần đọc gần nhất của caller —
        // luôn là version conflict (409), bất kể status hiện tại. Chỉ khi version khớp mà claim
        // vẫn thất bại mới là lỗi nghiệp vụ thật (422).
        if (current.version !== expectedVersion) {
          throw new StockCountConcurrencyConflictError(id);
        }
        throw new StockCountStatusConflictError(current.status);
      }

      const current = await tx.stockCount.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (!current) {
        throw new StockCountStatusConflictError(null);
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
          await this.inventoryDomainService.adjust(tx, {
            organizationId,
            warehouseId: current.warehouseId,
            productId: existingItem.productId,
            delta: Number(difference),
            movementType: 'COUNT',
            referenceType: 'COUNT',
            referenceId: id,
            remark: input.remark ?? null,
            createdBy: updatedBy,
          });
        }
      }

      // Trạng thái/version đã được claim ở bước đầu — chỉ đọc lại để trả về entity mới nhất
      // (actualQty/difference trên từng dòng vừa được cập nhật trong vòng lặp phía trên).
      const updated = await tx.stockCount.findFirstOrThrow({
        where: { id, organizationId },
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
      version: stockCount.version,
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
