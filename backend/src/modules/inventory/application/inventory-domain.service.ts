import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  InventoryMovementType,
  InventoryReferenceType,
} from '../domain/entities/inventory.entity';
import {
  INVENTORY_REPOSITORY,
  RecordMovementInput,
  RecordMovementResult,
} from '../domain/repositories/inventory.repository.interface';
import type { IInventoryRepository } from '../domain/repositories/inventory.repository.interface';

export interface IncreaseInventoryInput {
  organizationId: string;
  warehouseId: string;
  productId: string;
  /** Số lượng nhập, luôn dương. */
  quantity: number;
  unitCost: number;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  remark?: string | null;
  createdBy: string;
}

export interface DecreaseInventoryInput {
  organizationId: string;
  warehouseId: string;
  productId: string;
  /** Số lượng xuất, luôn dương — service tự quy đổi thành delta âm. */
  quantity: number;
  movementType: InventoryMovementType;
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  remark?: string | null;
  createdBy: string;
}

export interface AdjustInventoryInput {
  organizationId: string;
  warehouseId: string;
  productId: string;
  /** Delta có dấu — caller (Adjustment/Stock Count) quyết định dấu. */
  delta: number;
  /**
   * ADJUSTMENT: kiểm tra `inventory.allowNegativeStock` trước khi cho phép âm kho (giữ đúng
   * hành vi hiện có của Inventory Adjustment). COUNT: KHÔNG kiểm tra — Stock Count ghi lại
   * đúng số đã đếm thực tế (đã validate >= 0 ở DTO `CompleteStockCountItemDto`), giữ đúng
   * hành vi hiện có (chưa từng check âm kho cho COUNT trước T004).
   */
  movementType: 'ADJUSTMENT' | 'COUNT';
  referenceType: InventoryReferenceType;
  referenceId?: string | null;
  remark?: string | null;
  createdBy: string;
}

export interface TransferInventoryInput {
  /** OUT = trừ kho nguồn (có kiểm tra âm kho — Decision 9, SPEC-INV-001). IN = cộng kho đích (không kiểm tra). */
  direction: 'OUT' | 'IN';
  organizationId: string;
  warehouseId: string;
  productId: string;
  /** Số lượng điều chuyển, luôn dương. */
  quantity: number;
  /** Chỉ dùng khi direction=IN — giá vốn đã snapshot từ avgCostAfter của lượt OUT tương ứng. */
  unitCost?: number | null;
  referenceId?: string | null;
  createdBy: string;
}

/**
 * Cửa ngõ ghi DUY NHẤT của Inventory (SPEC-INV-001, Decision 3/11/12 — Single Writer, không
 * ngoại lệ). Mọi module cần thay đổi tồn kho (Purchase Order, Purchase Return, Transfer,
 * Inventory Adjustment, Stock Count, Checkout) phải import `InventoryModule` và gọi qua service
 * này — không được inject `IInventoryRepository`/`INVENTORY_REPOSITORY` trực tiếp (Repository
 * là chi tiết nội bộ, không được export ra ngoài module — Decision 8).
 *
 * Cả 5 phương thức public đều nhận `tx: Prisma.TransactionClient` bắt buộc, KHÔNG tự mở/commit/
 * rollback transaction — transaction do caller quản lý (Decision 5/6, giữ nguyên Transaction
 * Boundary hiện có của từng module nguồn — xem inventory-transaction-boundary.md).
 */
@Injectable()
export class InventoryDomainService {
  constructor(
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: IInventoryRepository,
  ) {}

  /** Nhập kho — không kiểm tra âm kho, tính lại Average Cost theo unitCost. Dùng cho Purchase Order. */
  async increase(
    tx: Prisma.TransactionClient,
    input: IncreaseInventoryInput,
  ): Promise<RecordMovementResult> {
    return this.recordMovement(tx, {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      movementType: input.movementType,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      quantity: input.quantity,
      unitCost: input.unitCost,
      remark: input.remark ?? null,
      checkNegativeStock: false,
      createdBy: input.createdBy,
    });
  }

  /** Xuất kho — luôn kiểm tra âm kho, giữ nguyên Average Cost hiện có. Dùng cho Purchase Return, Checkout. */
  async decrease(
    tx: Prisma.TransactionClient,
    input: DecreaseInventoryInput,
  ): Promise<RecordMovementResult> {
    return this.recordMovement(tx, {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      movementType: input.movementType,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      quantity: -input.quantity,
      unitCost: null,
      remark: input.remark ?? null,
      checkNegativeStock: true,
      createdBy: input.createdBy,
    });
  }

  /** Điều chỉnh theo delta có dấu — dùng cho Inventory Adjustment và Stock Count. */
  async adjust(
    tx: Prisma.TransactionClient,
    input: AdjustInventoryInput,
  ): Promise<RecordMovementResult> {
    return this.recordMovement(tx, {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      movementType: input.movementType,
      referenceType: input.referenceType,
      referenceId: input.referenceId ?? null,
      quantity: input.delta,
      unitCost: null,
      remark: input.remark ?? null,
      checkNegativeStock: input.movementType === 'ADJUSTMENT',
      createdBy: input.createdBy,
    });
  }

  /**
   * Điều chuyển kho — OUT trừ kho nguồn (kiểm tra âm kho), IN cộng kho đích (không kiểm tra,
   * dùng unitCost đã snapshot từ avgCostAfter của lượt OUT). Hai lượt gọi nằm ở 2 transaction
   * tách biệt theo thời gian (approve/receive) — xem inventory-transaction-boundary.md §2,
   * KHÔNG gộp lại ở đây.
   */
  async transfer(
    tx: Prisma.TransactionClient,
    input: TransferInventoryInput,
  ): Promise<RecordMovementResult> {
    const isOut = input.direction === 'OUT';
    return this.recordMovement(tx, {
      organizationId: input.organizationId,
      warehouseId: input.warehouseId,
      productId: input.productId,
      movementType: isOut ? 'TRANSFER_OUT' : 'TRANSFER_IN',
      referenceType: 'TRANSFER',
      referenceId: input.referenceId ?? null,
      quantity: isOut ? -input.quantity : input.quantity,
      unitCost: isOut ? null : (input.unitCost ?? null),
      remark: null,
      checkNegativeStock: isOut,
      createdBy: input.createdBy,
    });
  }

  /** Cửa ngõ tổng quát — dùng khi 4 phương thức trên không phù hợp (module tương lai). */
  async recordMovement(
    tx: Prisma.TransactionClient,
    input: RecordMovementInput,
  ): Promise<RecordMovementResult> {
    const result = await this.inventoryRepository.recordMovement(tx, input);
    this.onMovementRecorded(result);
    return result;
  }

  /** Điểm mở rộng cho T005 (Domain Events) — cố ý để trống, không publish trong Sprint-00 (Decision 7). */
  private onMovementRecorded(result: RecordMovementResult): void {
    void result;
  }
}
