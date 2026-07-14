import { Prisma } from '@prisma/client';

export interface InventoryDeltaInput {
  beforeQuantity: Prisma.Decimal;
  beforeAvgCost: Prisma.Decimal;
  delta: Prisma.Decimal;
  /** Chỉ có ý nghĩa khi delta > 0 (nhập kho) — dùng để tính lại Average Cost. */
  unitCost?: Prisma.Decimal | null;
}

export interface InventoryDeltaResult {
  afterQuantity: Prisma.Decimal;
  avgCost: Prisma.Decimal;
  /** avgCost mới nếu delta > 0 và có unitCost, ngược lại giữ nguyên lastCost cũ do caller truyền vào. */
  lastCost: Prisma.Decimal | null;
}

/**
 * Bình quân gia quyền di động (Moving Average Cost) — dùng chung cho mọi nơi ghi
 * InventoryMovement (PrismaInventoryRepository.recordMovement và các repository
 * nghiệp vụ khác cần tự mở transaction riêng, ví dụ PrismaTransferRepository).
 * Xuất kho (delta <= 0) không tính lại avgCost — dùng nguyên avgCost hiện có làm giá vốn.
 */
export function applyInventoryDelta(
  input: InventoryDeltaInput,
): InventoryDeltaResult {
  const afterQuantity = input.beforeQuantity.plus(input.delta);

  if (input.delta.greaterThan(0) && input.unitCost != null) {
    const existingValue = input.beforeQuantity.times(input.beforeAvgCost);
    const incomingValue = input.delta.times(input.unitCost);
    const avgCost = afterQuantity.isZero()
      ? new Prisma.Decimal(0)
      : existingValue.plus(incomingValue).dividedBy(afterQuantity);
    return { afterQuantity, avgCost, lastCost: input.unitCost };
  }

  return { afterQuantity, avgCost: input.beforeAvgCost, lastCost: null };
}
