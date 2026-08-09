import { z } from 'zod';

/** Mirrors `CreatePurchaseOrderDto` (SPEC-T045 §5). No Edit schema — no update endpoint. */
export const createPurchaseOrderSchema = z.object({
  branchId: z.string().min(1, 'Vui lòng chọn chi nhánh'),
  supplierId: z.string().min(1, 'Vui lòng chọn nhà cung cấp'),
  expectedAt: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, 'Vui lòng chọn sản phẩm'),
        warehouseId: z.string().min(1, 'Vui lòng chọn kho'),
        quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0'),
        unitCost: z.coerce.number().min(0, 'Đơn giá không được âm'),
        discount: z.coerce.number().min(0, 'Chiết khấu không được âm').optional(),
        taxAmount: z.coerce.number().min(0, 'Thuế không được âm').optional(),
      }),
    )
    .min(1, 'Cần ít nhất 1 sản phẩm'),
});

export type CreatePurchaseOrderFormValues = z.input<typeof createPurchaseOrderSchema>;
export type CreatePurchaseOrderFormOutput = z.output<typeof createPurchaseOrderSchema>;
