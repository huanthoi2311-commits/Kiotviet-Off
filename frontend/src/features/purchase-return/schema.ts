import { z } from 'zod';

const PURCHASE_RETURN_REASONS = ['DAMAGED', 'WRONG_PRODUCT', 'EXPIRED', 'OTHER'] as const;

/**
 * Mirrors `CreatePurchaseReturnDto` (SPEC-T045 §7). `quantity` is checked client-side only against
 * the originally-ordered line quantity (a cheap sanity bound) — the server is authoritative on
 * "already returned" (PURCHASE_RETURN_006), which the frontend has no cheap way to pre-compute.
 */
export const createPurchaseReturnSchema = z.object({
  purchaseOrderId: z.string().min(1, 'Vui lòng chọn đơn nhập hàng'),
  reason: z.enum(PURCHASE_RETURN_REASONS),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        purchaseItemId: z.string().min(1, 'Vui lòng chọn dòng hàng'),
        quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0'),
      }),
    )
    .min(1, 'Cần ít nhất 1 sản phẩm'),
});

export type CreatePurchaseReturnFormValues = z.input<typeof createPurchaseReturnSchema>;
export type CreatePurchaseReturnFormOutput = z.output<typeof createPurchaseReturnSchema>;
