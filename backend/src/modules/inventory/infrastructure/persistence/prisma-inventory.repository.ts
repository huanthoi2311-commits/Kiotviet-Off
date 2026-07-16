import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { applyInventoryDelta } from '../../../../common/utils/average-cost.util';
import {
  InventoryEntity,
  InventoryMovementEntity,
} from '../../domain/entities/inventory.entity';
import {
  InventoryConcurrencyConflictError,
  InventoryInsufficientStockError,
} from '../../domain/errors/inventory.errors';
import {
  IInventoryRepository,
  InventorySearchParams,
  InventorySearchResult,
  MovementSearchParams,
  MovementSearchResult,
  RecordMovementInput,
  RecordMovementResult,
} from '../../domain/repositories/inventory.repository.interface';

const ALLOW_NEGATIVE_STOCK_SETTING_KEY = 'inventory.allowNegativeStock';

type RawInventory = Prisma.InventoryGetPayload<Record<string, never>>;
type RawMovement = Prisma.InventoryMovementGetPayload<Record<string, never>>;

@Injectable()
export class PrismaInventoryRepository implements IInventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(params: InventorySearchParams): Promise<InventorySearchResult> {
    const where: Prisma.InventoryWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      warehouseId: params.warehouseId,
      productId: params.productId,
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getByProduct(
    productId: string,
    organizationId: string,
  ): Promise<InventoryEntity[]> {
    const items = await this.prisma.inventory.findMany({
      where: { productId, organizationId, deletedAt: null },
      orderBy: { warehouseId: 'asc' },
    });
    return items.map((item) => this.toEntity(item));
  }

  async getHistory(
    params: MovementSearchParams,
  ): Promise<MovementSearchResult> {
    const where: Prisma.InventoryMovementWhereInput = {
      organizationId: params.organizationId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      movementType: params.movementType,
      referenceType: params.referenceType,
      ...(params.createdFrom || params.createdTo
        ? { createdAt: { gte: params.createdFrom, lte: params.createdTo } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toMovementEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * Điểm ghi duy nhất cho mọi biến động tồn kho (SPEC-INV-001, T004): (1) đọc snapshot hiện
   * tại trong `tx` của caller, (2) tính before/after quantity + Average Cost, (3) nếu
   * `checkNegativeStock` và không đủ tồn kho (và Setting không cho phép âm) → ném lỗi trước
   * khi ghi bất cứ gì, (4) Optimistic Lock: `updateMany WHERE quantity = beforeQuantity` — 0
   * dòng bị ảnh hưởng nghĩa là tồn kho đã đổi do giao dịch khác chạy chen giữa → ném
   * `InventoryConcurrencyConflictError` (trừ khi đây là lần đầu tạo dòng Inventory, khi đó
   * `create` mới), (5) ghi 1 dòng `InventoryMovement` bất biến. `tx` bắt buộc — không tự mở,
   * không commit, không rollback transaction.
   */
  async recordMovement(
    tx: Prisma.TransactionClient,
    input: RecordMovementInput,
  ): Promise<RecordMovementResult> {
    const existing = await tx.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: input.warehouseId,
          productId: input.productId,
        },
      },
    });

    const delta = new Prisma.Decimal(input.quantity);
    const beforeQuantity = existing?.quantity ?? new Prisma.Decimal(0);
    const beforeAvgCost = existing?.avgCost ?? new Prisma.Decimal(0);
    const { afterQuantity, avgCost, lastCost } = applyInventoryDelta({
      beforeQuantity,
      beforeAvgCost,
      delta,
      unitCost:
        input.unitCost != null ? new Prisma.Decimal(input.unitCost) : null,
    });
    const resolvedLastCost =
      lastCost ?? existing?.lastCost ?? new Prisma.Decimal(0);

    if (input.checkNegativeStock) {
      const negativeStockSetting = await tx.setting.findFirst({
        where: {
          organizationId: input.organizationId,
          branchId: null,
          key: ALLOW_NEGATIVE_STOCK_SETTING_KEY,
        },
      });
      const allowNegativeStock = negativeStockSetting?.value === true;
      if (!allowNegativeStock && afterQuantity.lessThan(0)) {
        throw new InventoryInsufficientStockError(
          input.productId,
          beforeQuantity.toString(),
        );
      }
    }

    const updateResult = await tx.inventory.updateMany({
      where: {
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantity: beforeQuantity,
      },
      data: {
        quantity: afterQuantity,
        avgCost,
        lastCost: resolvedLastCost,
        updatedBy: input.createdBy,
      },
    });

    if (updateResult.count === 0) {
      if (!existing) {
        await tx.inventory.create({
          data: {
            organizationId: input.organizationId,
            warehouseId: input.warehouseId,
            productId: input.productId,
            quantity: afterQuantity,
            reservedQty: 0,
            avgCost,
            lastCost: resolvedLastCost,
            createdBy: input.createdBy,
            updatedBy: input.createdBy,
          },
        });
      } else {
        throw new InventoryConcurrencyConflictError(input.productId);
      }
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId: input.organizationId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        movementType: input.movementType,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        quantity: delta,
        beforeQuantity,
        afterQuantity,
        unitCost: input.unitCost ?? null,
        remark: input.remark ?? null,
        createdBy: input.createdBy,
      },
    });

    return {
      movement: this.toMovementEntity(movement),
      avgCostAfter: avgCost.toString(),
    };
  }

  private toEntity(inventory: RawInventory): InventoryEntity {
    return {
      id: inventory.id,
      organizationId: inventory.organizationId,
      warehouseId: inventory.warehouseId,
      productId: inventory.productId,
      quantity: inventory.quantity.toString(),
      reservedQty: inventory.reservedQty.toString(),
      availableQty: inventory.quantity.minus(inventory.reservedQty).toString(),
      avgCost: inventory.avgCost.toString(),
      lastCost: inventory.lastCost.toString(),
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    };
  }

  private toMovementEntity(movement: RawMovement): InventoryMovementEntity {
    return {
      id: movement.id,
      organizationId: movement.organizationId,
      warehouseId: movement.warehouseId,
      productId: movement.productId,
      movementType: movement.movementType,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      quantity: movement.quantity.toString(),
      beforeQuantity: movement.beforeQuantity.toString(),
      afterQuantity: movement.afterQuantity.toString(),
      unitCost: movement.unitCost?.toString() ?? null,
      remark: movement.remark,
      createdAt: movement.createdAt,
    };
  }
}
