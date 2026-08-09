import { z } from 'zod';

/** Mirrors `CreateStockCountDto` (SPEC-T044 §6.2). Actual counting happens later via Complete. */
export const createStockCountSchema = z.object({
  warehouseId: z.string().min(1, 'Vui lòng chọn kho'),
  note: z.string().optional(),
  products: z
    .array(z.object({ productId: z.string().min(1, 'Vui lòng chọn sản phẩm') }))
    .min(1, 'Cần ít nhất 1 sản phẩm')
    .refine((products) => new Set(products.map((p) => p.productId)).size === products.length, {
      message: 'Sản phẩm bị trùng lặp',
    }),
});

export type CreateStockCountFormValues = z.input<typeof createStockCountSchema>;
export type CreateStockCountFormOutput = z.output<typeof createStockCountSchema>;

/** Mirrors `CompleteStockCountDto` (SPEC-T044 §6.2) — one row per existing `StockCountItem`. */
export const completeStockCountSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      actualQty: z.coerce.number().min(0, 'Số lượng đếm không được âm'),
      remark: z.string().optional(),
    }),
  ),
});

export type CompleteStockCountFormValues = z.input<typeof completeStockCountSchema>;
export type CompleteStockCountFormOutput = z.output<typeof completeStockCountSchema>;
