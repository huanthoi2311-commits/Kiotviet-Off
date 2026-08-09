import { z } from 'zod';

const ADJUSTMENT_REASONS = ['LOST', 'DAMAGED', 'FOUND', 'SYSTEM', 'OTHER'] as const;

/** Mirrors `CreateInventoryAdjustmentDto` (SPEC-T044 §5.2). No Edit schema — no update endpoint. */
export const createInventoryAdjustmentSchema = z.object({
  warehouseId: z.string().min(1, 'Vui lòng chọn kho'),
  reason: z.enum(ADJUSTMENT_REASONS),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, 'Vui lòng chọn sản phẩm'),
        quantity: z.coerce.number().refine((v) => v !== 0, 'Số lượng chênh lệch không được bằng 0'),
        remark: z.string().optional(),
      }),
    )
    .min(1, 'Cần ít nhất 1 sản phẩm'),
});

export type CreateInventoryAdjustmentFormValues = z.input<typeof createInventoryAdjustmentSchema>;
export type CreateInventoryAdjustmentFormOutput = z.output<typeof createInventoryAdjustmentSchema>;
