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
  TransferEntity,
  TransferStatus,
} from '../../domain/entities/transfer.entity';
import {
  CreateTransferInput,
  ITransferRepository,
  TransferConcurrencyConflictError,
  TransferMovementInput,
  TransferNegativeStockError,
  TransferSearchParams,
  TransferSearchResult,
  TransferStatusConflictError,
} from '../../domain/repositories/transfer.repository.interface';
import type { RecordMovementResult } from '../../../inventory/domain/repositories/inventory.repository.interface';

const TRANSFER_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.TransferInclude;

type TransferWithItems = Prisma.TransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;

@Injectable()
export class PrismaTransferRepository implements ITransferRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryDomainService: InventoryDomainService,
  ) {}

  async create(input: CreateTransferInput): Promise<TransferEntity> {
    try {
      const transfer = await this.prisma.transfer.create({
        data: {
          organizationId: input.organizationId,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          code: input.code,
          note: input.note ?? null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            })),
          },
        },
        include: TRANSFER_INCLUDE,
      });
      return this.toEntity(transfer);
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<TransferEntity | null> {
    const transfer = await this.prisma.transfer.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: TRANSFER_INCLUDE,
    });
    return transfer ? this.toEntity(transfer) : null;
  }

  async search(params: TransferSearchParams): Promise<TransferSearchResult> {
    const where: Prisma.TransferWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      status: params.status,
      fromWarehouseId: params.fromWarehouseId,
      toWarehouseId: params.toWarehouseId,
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async existsByCode(organizationId: string, code: string): Promise<boolean> {
    const found = await this.prisma.transfer.findFirst({
      where: { organizationId, code },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * T051.02 — Chuyển trạng thái + ghi các InventoryMovement liên quan trong 1 transaction, Optimistic
   * Lock CAS-FIRST: bước đầu tiên là `updateMany({where:{id, organizationId, status:{in:expectedStatuses},
   * version:expectedVersion}})` để CLAIM quyền chuyển trạng thái trước khi chạm vào Inventory. Request
   * thua cuộc (0 dòng bị ảnh hưởng) ném lỗi ngay tại đây — KHÔNG chạy vòng lặp Inventory bên dưới.
   * Request thắng cuộc mới tiếp tục: gọi InventoryDomainService.transfer() (Single Writer —
   * SPEC-INV-001) cho từng movement. `avgCostAfter` trả về từ lượt OUT (Approve) chính là Average
   * Cost của kho nguồn TẠI THỜI ĐIỂM trừ (decrease/OUT không tính lại avgCost, nên giá trị này không
   * đổi trước/sau) — dùng thẳng để snapshot vào TransferItem.unitCost thay vì phải đọc riêng Inventory
   * (không được phép — Decision 11). `InventoryInsufficientStockError` từ lượt OUT được dịch sang
   * `TransferNegativeStockError` để Service có lớp lỗi domain riêng, nhất quán với Purchase
   * Return/Inventory Adjustment.
   */
  async transitionStatus(
    id: string,
    organizationId: string,
    expectedStatuses: TransferStatus[],
    nextStatus: TransferStatus,
    expectedVersion: number,
    movements: TransferMovementInput[],
    updatedBy: string,
  ): Promise<TransferEntity> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.transfer.updateMany({
        where: {
          id,
          organizationId,
          status: { in: expectedStatuses },
          version: expectedVersion,
        },
        data: { status: nextStatus, version: { increment: 1 }, updatedBy },
      });

      if (claim.count === 0) {
        const current = await tx.transfer.findFirst({
          where: { id, organizationId },
          select: { status: true, version: true },
        });
        if (!current) {
          throw new TransferStatusConflictError('CANCELLED');
        }
        // T051.02: version lệch => request khác đã ghi đè kể từ lần đọc gần nhất của caller —
        // luôn là version conflict (409), bất kể status hiện tại. Chỉ khi version khớp mà claim
        // vẫn thất bại mới là lỗi nghiệp vụ thật (422) — status không nằm trong tập cho phép.
        if (current.version !== expectedVersion) {
          throw new TransferConcurrencyConflictError(id);
        }
        throw new TransferStatusConflictError(current.status);
      }

      const current = await tx.transfer.findFirst({
        where: { id, organizationId },
      });
      if (!current) {
        throw new TransferStatusConflictError('CANCELLED');
      }

      for (const movement of movements) {
        let result: RecordMovementResult;
        try {
          result = await this.inventoryDomainService.transfer(tx, {
            direction: movement.direction,
            organizationId: current.organizationId,
            warehouseId: movement.warehouseId,
            productId: movement.productId,
            quantity: movement.quantity,
            unitCost: movement.unitCost ?? null,
            referenceId: id,
            createdBy: updatedBy,
          });
        } catch (error) {
          if (error instanceof InventoryInsufficientStockError) {
            throw new TransferNegativeStockError(movement.productId);
          }
          throw error;
        }

        if (movement.captureUnitCostToItem) {
          await tx.transferItem.update({
            where: { id: movement.transferItemId },
            data: {
              unitCost: new Prisma.Decimal(result.avgCostAfter),
              updatedBy,
            },
          });
        }
      }

      // Trạng thái/version đã được claim ở bước đầu — chỉ đọc lại để trả về entity mới nhất
      // (unitCost trên từng dòng vừa được cập nhật trong vòng lặp phía trên nếu có).
      const updated = await tx.transfer.findFirstOrThrow({
        where: { id, organizationId },
        include: TRANSFER_INCLUDE,
      });

      return this.toEntity(updated);
    });
  }

  private translateWriteError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return new ConflictException(
          withCode(
            ErrorCode.TRANSFER_DUPLICATE,
            'Mã phiếu điều chuyển đã tồn tại',
          ),
        );
      }
      if (error.code === 'P2003') {
        const field = (error.meta?.field_name as string | undefined) ?? '';
        const label = field.includes('fromWarehouseId')
          ? 'fromWarehouseId'
          : field.includes('toWarehouseId')
            ? 'toWarehouseId'
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

  private toEntity(transfer: TransferWithItems): TransferEntity {
    return {
      id: transfer.id,
      organizationId: transfer.organizationId,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      code: transfer.code,
      status: transfer.status,
      note: transfer.note,
      version: transfer.version,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      deletedAt: transfer.deletedAt,
      items: transfer.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity.toString(),
        unitCost: item.unitCost?.toString() ?? null,
      })),
    };
  }
}
