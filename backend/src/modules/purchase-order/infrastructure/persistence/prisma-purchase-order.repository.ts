import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { applyInventoryDelta } from '../../../../common/utils/average-cost.util';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import {
  PurchaseOrderEntity,
  PurchaseOrderStatus,
} from '../../domain/entities/purchase-order.entity';
import {
  CreatePurchaseOrderInput,
  IPurchaseOrderRepository,
  PurchaseOrderSearchParams,
  PurchaseOrderSearchResult,
  PurchaseOrderStatusConflictError,
} from '../../domain/repositories/purchase-order.repository.interface';

const PURCHASE_ORDER_INCLUDE = {
  purchaseItems: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderWithItems = Prisma.PurchaseOrderGetPayload<{
  include: typeof PURCHASE_ORDER_INCLUDE;
}>;

@Injectable()
export class PrismaPurchaseOrderRepository implements IPurchaseOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderEntity> {
    try {
      const order = await this.prisma.purchaseOrder.create({
        data: {
          organizationId: input.organizationId,
          branchId: input.branchId,
          supplierId: input.supplierId,
          code: input.code,
          expectedAt: input.expectedAt ?? null,
          totalAmount: input.totalAmount,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          purchaseItems: {
            create: input.items.map((item) => ({
              productId: item.productId,
              warehouseId: item.warehouseId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              discount: item.discount,
              taxAmount: item.taxAmount,
              totalAmount: item.totalAmount,
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            })),
          },
        },
        include: PURCHASE_ORDER_INCLUDE,
      });
      return this.toEntity(order);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<PurchaseOrderEntity | null> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: PURCHASE_ORDER_INCLUDE,
    });
    return order ? this.toEntity(order) : null;
  }

  async search(
    params: PurchaseOrderSearchParams,
  ): Promise<PurchaseOrderSearchResult> {
    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      supplierId: params.supplierId,
      branchId: params.branchId,
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: PURCHASE_ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(organizationId: string, code: string): Promise<boolean> {
    const found = await this.prisma.purchaseOrder.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return !!found;
  }

  async approve(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      ['DRAFT'],
      'APPROVED',
      updatedBy,
    );
  }

  async cancel(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      ['DRAFT', 'PENDING', 'APPROVED'],
      'CANCELLED',
      updatedBy,
    );
  }

  /**
   * APPROVED → RECEIVED trong 1 transaction: với mỗi PurchaseItem, đọc snapshot Inventory
   * hiện tại của đúng warehouseId của dòng hàng đó, tính lại Average Cost theo unitCost,
   * upsert Inventory, ghi 1 InventoryMovement (PURCHASE) bất biến, và cập nhật
   * receivedQuantity = quantity trên PurchaseItem. Không gọi IInventoryRepository.recordMovement()
   * vì hàm đó tự mở transaction riêng — không thể tham gia transaction ngoài này, vi phạm
   * yêu cầu "Purchase + Inventory + Movement History phải là một Transaction" của Prompt 027.
   */
  async receive(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.purchaseOrder.findFirst({
        where: { id, organizationId },
        include: { purchaseItems: true },
      });
      if (!current || current.status !== 'APPROVED') {
        throw new PurchaseOrderStatusConflictError(
          (current?.status as PurchaseOrderStatus) ?? null,
        );
      }

      for (const item of current.purchaseItems) {
        const existingInventory = await tx.inventory.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: item.warehouseId,
              productId: item.productId,
            },
          },
        });
        const beforeQuantity =
          existingInventory?.quantity ?? new Prisma.Decimal(0);
        const beforeAvgCost =
          existingInventory?.avgCost ?? new Prisma.Decimal(0);
        const { afterQuantity, avgCost, lastCost } = applyInventoryDelta({
          beforeQuantity,
          beforeAvgCost,
          delta: item.quantity,
          unitCost: item.unitCost,
        });
        const resolvedLastCost =
          lastCost ?? existingInventory?.lastCost ?? new Prisma.Decimal(0);

        await tx.inventory.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: item.warehouseId,
              productId: item.productId,
            },
          },
          create: {
            organizationId,
            warehouseId: item.warehouseId,
            productId: item.productId,
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
            warehouseId: item.warehouseId,
            productId: item.productId,
            movementType: 'PURCHASE',
            referenceType: 'PURCHASE',
            referenceId: id,
            quantity: item.quantity,
            beforeQuantity,
            afterQuantity,
            unitCost: item.unitCost,
            remark: null,
            createdBy: updatedBy,
          },
        });

        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.quantity, updatedBy },
        });
      }

      // "Purchase increases Debt" (Prompt 029) — ghi 1 dòng Debt (PAYABLE, dương) vào
      // sổ cái ghi-thêm chung với PurchaseReturn (Prompt 028, amount âm) và Payment
      // (giảm công nợ, đối trừ ở tầng truy vấn GET /supplier-debt). Không update dòng
      // Debt nào đã có — đúng nguyên tắc "không update Debt trực tiếp".
      await tx.debt.create({
        data: {
          organizationId,
          supplierId: current.supplierId,
          type: 'PAYABLE',
          refType: 'PurchaseOrder',
          refId: id,
          amount: current.totalAmount,
          paidAmount: 0,
          status: 'OPEN',
          createdBy: updatedBy,
          updatedBy,
        },
      });

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED', updatedBy },
        include: PURCHASE_ORDER_INCLUDE,
      });

      return this.toEntity(updated);
    });
  }

  private async transitionSimple(
    id: string,
    organizationId: string,
    expectedStatuses: PurchaseOrderStatus[],
    nextStatus: PurchaseOrderStatus,
    updatedBy: string,
  ): Promise<PurchaseOrderEntity> {
    const result = await this.prisma.purchaseOrder.updateMany({
      where: { id, organizationId, status: { in: expectedStatuses } },
      data: { status: nextStatus, updatedBy },
    });

    if (result.count === 0) {
      const current = await this.prisma.purchaseOrder.findFirst({
        where: { id, organizationId },
        select: { status: true },
      });
      throw new PurchaseOrderStatusConflictError(
        (current?.status as PurchaseOrderStatus) ?? null,
      );
    }

    const updated = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: PURCHASE_ORDER_INCLUDE,
    });
    return this.toEntity(updated as PurchaseOrderWithItems);
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException(
          withCode(
            ErrorCode.PURCHASE_ORDER_DUPLICATE,
            'Mã đơn nhập hàng đã tồn tại',
          ),
        );
      }
      if (error.code === 'P2003') {
        const field = (error.meta?.field_name as string | undefined) ?? '';
        const label = field.includes('supplierId')
          ? 'supplierId'
          : field.includes('branchId')
            ? 'branchId'
            : field.includes('warehouseId')
              ? 'warehouseId'
              : field.includes('productId')
                ? 'productId'
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

  private toEntity(order: PurchaseOrderWithItems): PurchaseOrderEntity {
    return {
      id: order.id,
      organizationId: order.organizationId,
      branchId: order.branchId,
      supplierId: order.supplierId,
      code: order.code,
      status: order.status,
      totalAmount: order.totalAmount.toString(),
      paidAmount: order.paidAmount.toString(),
      expectedAt: order.expectedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deletedAt: order.deletedAt,
      items: order.purchaseItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity.toString(),
        receivedQuantity: item.receivedQuantity.toString(),
        unitCost: item.unitCost.toString(),
        discount: item.discount.toString(),
        taxAmount: item.taxAmount.toString(),
        totalAmount: item.totalAmount.toString(),
      })),
    };
  }
}
