import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { InventoryDomainService } from '../../../inventory/application/inventory-domain.service';
import { InventoryInsufficientStockError } from '../../../inventory/domain/errors/inventory.errors';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { InventoryAdjustmentEntity } from '../../domain/entities/inventory-adjustment.entity';
import {
  CreateInventoryAdjustmentInput,
  IInventoryAdjustmentRepository,
  InventoryAdjustmentConcurrencyConflictError,
  InventoryAdjustmentNegativeStockError,
  InventoryAdjustmentSearchParams,
  InventoryAdjustmentSearchResult,
  InventoryAdjustmentStatusConflictError,
} from '../../domain/repositories/inventory-adjustment.repository.interface';

const ADJUSTMENT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.InventoryAdjustmentInclude;

type AdjustmentWithItems = Prisma.InventoryAdjustmentGetPayload<{
  include: typeof ADJUSTMENT_INCLUDE;
}>;

@Injectable()
export class PrismaInventoryAdjustmentRepository implements IInventoryAdjustmentRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryDomainService: InventoryDomainService,
  ) {}

  async create(
    input: CreateInventoryAdjustmentInput,
  ): Promise<InventoryAdjustmentEntity> {
    try {
      const adjustment = await this.prisma.inventoryAdjustment.create({
        data: {
          organizationId: input.organizationId,
          warehouseId: input.warehouseId,
          code: input.code,
          reason: input.reason,
          note: input.note ?? null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              remark: item.remark ?? null,
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            })),
          },
        },
        include: ADJUSTMENT_INCLUDE,
      });
      return this.toEntity(adjustment);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InventoryAdjustmentEntity | null> {
    const adjustment = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: ADJUSTMENT_INCLUDE,
    });
    return adjustment ? this.toEntity(adjustment) : null;
  }

  async search(
    params: InventoryAdjustmentSearchParams,
  ): Promise<InventoryAdjustmentSearchResult> {
    const where: Prisma.InventoryAdjustmentWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      warehouseId: params.warehouseId,
      reason: params.reason,
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryAdjustment.findMany({
        where,
        include: ADJUSTMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.inventoryAdjustment.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(organizationId: string, code: string): Promise<boolean> {
    const found = await this.prisma.inventoryAdjustment.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return !!found;
  }

  async submit(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      'DRAFT',
      'SUBMITTED',
      updatedBy,
    );
  }

  async approve(
    id: string,
    organizationId: string,
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      'SUBMITTED',
      'APPROVED',
      updatedBy,
    );
  }

  /**
   * T051.02 — APPROVED → COMPLETED trong 1 transaction, Optimistic Lock CAS-FIRST: bước đầu tiên
   * là `updateMany({where:{id, organizationId, status:'APPROVED', version:expectedVersion}})` để
   * CLAIM quyền complete trước khi chạm vào Inventory. Request thua cuộc (0 dòng bị ảnh hưởng) ném
   * lỗi ngay tại đây — KHÔNG chạy vòng lặp Inventory bên dưới. Request thắng cuộc mới tiếp tục: với
   * mỗi dòng hàng, gọi InventoryDomainService.adjust() (Single Writer — SPEC-INV-001,
   * movementType=ADJUSTMENT tự kiểm tra âm kho + Optimistic Lock riêng của Inventory).
   * `InventoryInsufficientStockError` được dịch sang `InventoryAdjustmentNegativeStockError` để giữ
   * nguyên error contract hiện có (Service đã catch đúng lớp lỗi này).
   */
  async complete(
    id: string,
    organizationId: string,
    expectedVersion: number,
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.inventoryAdjustment.updateMany({
        where: {
          id,
          organizationId,
          status: 'APPROVED',
          version: expectedVersion,
        },
        data: { status: 'COMPLETED', version: { increment: 1 }, updatedBy },
      });

      if (claim.count === 0) {
        const current = await tx.inventoryAdjustment.findFirst({
          where: { id, organizationId },
          select: { status: true, version: true },
        });
        if (!current) {
          throw new InventoryAdjustmentStatusConflictError(null);
        }
        // T051.02: version lệch => request khác đã ghi đè kể từ lần đọc gần nhất của caller —
        // luôn là version conflict (409), bất kể status hiện tại. Chỉ khi version khớp mà claim
        // vẫn thất bại mới là lỗi nghiệp vụ thật (422).
        if (current.version !== expectedVersion) {
          throw new InventoryAdjustmentConcurrencyConflictError(id);
        }
        throw new InventoryAdjustmentStatusConflictError(current.status);
      }

      const current = await tx.inventoryAdjustment.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (!current) {
        throw new InventoryAdjustmentStatusConflictError(null);
      }

      for (const item of current.items) {
        try {
          await this.inventoryDomainService.adjust(tx, {
            organizationId,
            warehouseId: current.warehouseId,
            productId: item.productId,
            delta: Number(item.quantity),
            movementType: 'ADJUSTMENT',
            referenceType: 'SYSTEM',
            referenceId: id,
            remark: item.remark,
            createdBy: updatedBy,
          });
        } catch (error) {
          if (error instanceof InventoryInsufficientStockError) {
            throw new InventoryAdjustmentNegativeStockError(item.productId);
          }
          throw error;
        }
      }

      // Trạng thái/version đã được claim ở bước đầu — chỉ đọc lại để trả về entity mới nhất.
      const updated = await tx.inventoryAdjustment.findFirstOrThrow({
        where: { id, organizationId },
        include: ADJUSTMENT_INCLUDE,
      });

      return this.toEntity(updated);
    });
  }

  private async transitionSimple(
    id: string,
    organizationId: string,
    expectedStatus: 'DRAFT' | 'SUBMITTED',
    nextStatus: 'SUBMITTED' | 'APPROVED',
    updatedBy: string,
  ): Promise<InventoryAdjustmentEntity> {
    const result = await this.prisma.inventoryAdjustment.updateMany({
      where: { id, organizationId, status: expectedStatus },
      data: { status: nextStatus, updatedBy },
    });

    if (result.count === 0) {
      const current = await this.prisma.inventoryAdjustment.findFirst({
        where: { id, organizationId },
        select: { status: true },
      });
      throw new InventoryAdjustmentStatusConflictError(current?.status ?? null);
    }

    const updated = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, organizationId },
      include: ADJUSTMENT_INCLUDE,
    });
    return this.toEntity(updated as AdjustmentWithItems);
  }

  private translateWriteError(error: unknown): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        withCode(
          ErrorCode.INVENTORY_ADJUSTMENT_DUPLICATE,
          'Mã phiếu điều chỉnh đã tồn tại',
        ),
      );
    }
    return error as Error;
  }

  private toEntity(adjustment: AdjustmentWithItems): InventoryAdjustmentEntity {
    return {
      id: adjustment.id,
      organizationId: adjustment.organizationId,
      warehouseId: adjustment.warehouseId,
      code: adjustment.code,
      status: adjustment.status,
      reason: adjustment.reason,
      note: adjustment.note,
      version: adjustment.version,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
      deletedAt: adjustment.deletedAt,
      items: adjustment.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity.toString(),
        remark: item.remark,
      })),
    };
  }
}
