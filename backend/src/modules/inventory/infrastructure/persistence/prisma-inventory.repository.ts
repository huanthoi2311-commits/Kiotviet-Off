import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  InventoryEntity,
  InventoryMovementEntity,
} from '../../domain/entities/inventory.entity';
import {
  IInventoryRepository,
  InventorySearchParams,
  InventorySearchResult,
  MovementSearchParams,
  MovementSearchResult,
  RecordMovementInput,
} from '../../domain/repositories/inventory.repository.interface';

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
   * Điểm ghi duy nhất cho mọi biến động tồn kho: trong 1 transaction, (1) đọc snapshot
   * hiện tại, (2) tính before/after quantity + Average Cost (chỉ tính lại khi nhập kho,
   * quantity > 0 và có unitCost — xuất kho dùng nguyên avgCost hiện có làm giá vốn),
   * (3) upsert Inventory, (4) ghi 1 dòng InventoryMovement bất biến. Không có đường nào
   * khác để thay đổi Inventory.quantity ngoài hàm này.
   */
  async recordMovement(
    input: RecordMovementInput,
  ): Promise<InventoryMovementEntity> {
    return this.prisma.$transaction(async (tx) => {
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
      const afterQuantity = beforeQuantity.plus(delta);

      let avgCost = existing?.avgCost ?? new Prisma.Decimal(0);
      let lastCost = existing?.lastCost ?? new Prisma.Decimal(0);

      if (delta.greaterThan(0) && input.unitCost != null) {
        const unitCostDecimal = new Prisma.Decimal(input.unitCost);
        const existingValue = beforeQuantity.times(avgCost);
        const incomingValue = delta.times(unitCostDecimal);
        avgCost = afterQuantity.isZero()
          ? new Prisma.Decimal(0)
          : existingValue.plus(incomingValue).dividedBy(afterQuantity);
        lastCost = unitCostDecimal;
      }

      await tx.inventory.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: input.warehouseId,
            productId: input.productId,
          },
        },
        create: {
          organizationId: input.organizationId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          quantity: afterQuantity,
          reservedQty: 0,
          avgCost,
          lastCost,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
        },
        update: {
          quantity: afterQuantity,
          avgCost,
          lastCost,
          updatedBy: input.createdBy,
        },
      });

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

      return this.toMovementEntity(movement);
    });
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
