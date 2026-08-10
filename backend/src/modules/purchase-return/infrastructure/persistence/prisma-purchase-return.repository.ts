import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import { InventoryInsufficientStockError } from '../../../inventory/domain/errors/inventory.errors';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import {
  PurchaseReturnEntity,
  PurchaseReturnStatus,
} from '../../domain/entities/purchase-return.entity';
import {
  CreatePurchaseReturnInput,
  IPurchaseReturnRepository,
  PurchaseReturnConcurrencyConflictError,
  PurchaseReturnExceedsReceivedError,
  PurchaseReturnNegativeStockError,
  PurchaseReturnSearchParams,
  PurchaseReturnSearchResult,
  PurchaseReturnStatusConflictError,
} from '../../domain/repositories/purchase-return.repository.interface';

const PURCHASE_RETURN_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PurchaseReturnInclude;

type PurchaseReturnWithItems = Prisma.PurchaseReturnGetPayload<{
  include: typeof PURCHASE_RETURN_INCLUDE;
}>;

@Injectable()
export class PrismaPurchaseReturnRepository implements IPurchaseReturnRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryDomainService: InventoryDomainService,
  ) {}

  async create(
    input: CreatePurchaseReturnInput,
  ): Promise<PurchaseReturnEntity> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        for (const item of input.items) {
          const purchaseItem = await tx.purchaseItem.findUniqueOrThrow({
            where: { id: item.purchaseItemId },
          });
          const alreadyReturned = await tx.purchaseReturnItem.aggregate({
            _sum: { quantity: true },
            where: {
              purchaseItemId: item.purchaseItemId,
              purchaseReturn: { status: { not: 'CANCELLED' } },
            },
          });
          const totalReturned = (
            alreadyReturned._sum.quantity ?? new Prisma.Decimal(0)
          ).plus(item.quantity);

          if (totalReturned.greaterThan(purchaseItem.receivedQuantity)) {
            throw new PurchaseReturnExceedsReceivedError(item.purchaseItemId);
          }
        }

        const created = await tx.purchaseReturn.create({
          data: {
            organizationId: input.organizationId,
            purchaseOrderId: input.purchaseOrderId,
            supplierId: input.supplierId,
            code: input.code,
            reason: input.reason,
            note: input.note ?? null,
            totalAmount: input.totalAmount,
            createdBy: input.createdBy,
            updatedBy: input.createdBy,
            items: {
              create: input.items.map((item) => ({
                purchaseItemId: item.purchaseItemId,
                productId: item.productId,
                warehouseId: item.warehouseId,
                quantity: item.quantity,
                unitCost: item.unitCost,
                totalAmount: item.totalAmount,
                createdBy: input.createdBy,
                updatedBy: input.createdBy,
              })),
            },
          },
          include: PURCHASE_RETURN_INCLUDE,
        });
        return this.toEntity(created);
      });
    } catch (error) {
      if (error instanceof PurchaseReturnExceedsReceivedError) throw error;
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<PurchaseReturnEntity | null> {
    const purchaseReturn = await this.prisma.purchaseReturn.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: PURCHASE_RETURN_INCLUDE,
    });
    return purchaseReturn ? this.toEntity(purchaseReturn) : null;
  }

  async search(
    params: PurchaseReturnSearchParams,
  ): Promise<PurchaseReturnSearchResult> {
    const where: Prisma.PurchaseReturnWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      purchaseOrderId: params.purchaseOrderId,
      supplierId: params.supplierId,
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseReturn.findMany({
        where,
        include: PURCHASE_RETURN_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(organizationId: string, code: string): Promise<boolean> {
    const found = await this.prisma.purchaseReturn.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return !!found;
  }

  async approve(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<PurchaseReturnEntity> {
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
  ): Promise<PurchaseReturnEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      ['DRAFT', 'APPROVED'],
      'CANCELLED',
      updatedBy,
    );
  }

  /**
   * T051.02 — APPROVED → COMPLETED trong 1 transaction, Optimistic Lock CAS-FIRST: bước đầu tiên
   * là `updateMany({where:{id, organizationId, status:'APPROVED', version:expectedVersion}})` để
   * CLAIM quyền complete trước khi chạm vào Inventory. Request thua cuộc (0 dòng bị ảnh hưởng) ném
   * lỗi ngay tại đây — KHÔNG chạy vòng lặp Inventory/Debt bên dưới. Request thắng cuộc mới tiếp
   * tục: với mỗi dòng hàng, gọi InventoryDomainService.decrease() (Single Writer — SPEC-INV-001,
   * tự kiểm tra âm kho + Optimistic Lock riêng của Inventory) để ghi InventoryMovement (RETURN) +
   * đồng bộ Inventory, sau đó ghi 1 dòng Debt (PAYABLE, amount âm — giảm công nợ NCC).
   * `InventoryInsufficientStockError` từ InventoryDomainService được dịch sang
   * `PurchaseReturnNegativeStockError` để giữ nguyên error contract hiện có của module này (Service
   * đã catch đúng lớp lỗi này).
   */
  async complete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<PurchaseReturnEntity> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.purchaseReturn.updateMany({
        where: {
          id,
          organizationId,
          status: 'APPROVED',
          version: expectedVersion,
        },
        data: { status: 'COMPLETED', version: { increment: 1 }, updatedBy },
      });

      if (claim.count === 0) {
        const currentStatus = await tx.purchaseReturn.findFirst({
          where: { id, organizationId },
          select: { status: true },
        });
        if (!currentStatus || currentStatus.status !== 'APPROVED') {
          throw new PurchaseReturnStatusConflictError(
            (currentStatus?.status as PurchaseReturnStatus) ?? null,
          );
        }
        throw new PurchaseReturnConcurrencyConflictError(id);
      }

      const current = await tx.purchaseReturn.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (!current) {
        throw new PurchaseReturnStatusConflictError(null);
      }

      for (const item of current.items) {
        try {
          await this.inventoryDomainService.decrease(tx, {
            organizationId,
            warehouseId: item.warehouseId,
            productId: item.productId,
            quantity: Number(item.quantity),
            movementType: 'RETURN',
            referenceType: 'RETURN',
            referenceId: id,
            createdBy: updatedBy,
          });
        } catch (error) {
          if (error instanceof InventoryInsufficientStockError) {
            throw new PurchaseReturnNegativeStockError(item.productId);
          }
          throw error;
        }
      }

      await tx.debt.create({
        data: {
          organizationId,
          supplierId: current.supplierId,
          type: 'PAYABLE',
          refType: 'PurchaseReturn',
          refId: id,
          amount: current.totalAmount.negated(),
          paidAmount: 0,
          status: 'SETTLED',
          createdBy: updatedBy,
          updatedBy,
        },
      });

      // Trạng thái/version đã được claim ở bước đầu — chỉ đọc lại để trả về entity mới nhất.
      const updated = await tx.purchaseReturn.findFirstOrThrow({
        where: { id, organizationId },
        include: PURCHASE_RETURN_INCLUDE,
      });

      return this.toEntity(updated);
    });
  }

  private async transitionSimple(
    id: string,
    organizationId: string,
    expectedStatuses: PurchaseReturnStatus[],
    nextStatus: PurchaseReturnStatus,
    updatedBy: string,
  ): Promise<PurchaseReturnEntity> {
    const result = await this.prisma.purchaseReturn.updateMany({
      where: { id, organizationId, status: { in: expectedStatuses } },
      data: { status: nextStatus, updatedBy },
    });

    if (result.count === 0) {
      const current = await this.prisma.purchaseReturn.findFirst({
        where: { id, organizationId },
        select: { status: true },
      });
      throw new PurchaseReturnStatusConflictError(
        (current?.status as PurchaseReturnStatus) ?? null,
      );
    }

    const updated = await this.prisma.purchaseReturn.findFirst({
      where: { id, organizationId },
      include: PURCHASE_RETURN_INCLUDE,
    });
    return this.toEntity(updated as PurchaseReturnWithItems);
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException(
          withCode(
            ErrorCode.PURCHASE_RETURN_DUPLICATE,
            'Mã phiếu trả hàng đã tồn tại',
          ),
        );
      }
      if (error.code === 'P2003' || error.code === 'P2025') {
        const field = (error.meta?.field_name as string | undefined) ?? '';
        const label = field.includes('purchaseItemId')
          ? 'purchaseItemId'
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

  private toEntity(
    purchaseReturn: PurchaseReturnWithItems,
  ): PurchaseReturnEntity {
    return {
      id: purchaseReturn.id,
      organizationId: purchaseReturn.organizationId,
      purchaseOrderId: purchaseReturn.purchaseOrderId,
      supplierId: purchaseReturn.supplierId,
      code: purchaseReturn.code,
      status: purchaseReturn.status,
      reason: purchaseReturn.reason,
      totalAmount: purchaseReturn.totalAmount.toString(),
      note: purchaseReturn.note,
      version: purchaseReturn.version,
      createdAt: purchaseReturn.createdAt,
      updatedAt: purchaseReturn.updatedAt,
      deletedAt: purchaseReturn.deletedAt,
      items: purchaseReturn.items.map((item) => ({
        id: item.id,
        purchaseItemId: item.purchaseItemId,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity.toString(),
        unitCost: item.unitCost.toString(),
        totalAmount: item.totalAmount.toString(),
      })),
    };
  }
}
