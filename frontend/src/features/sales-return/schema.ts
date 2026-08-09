import { z } from 'zod';

const SALES_RETURN_REASONS = [
  'DAMAGED',
  'DEFECTIVE',
  'WRONG_PRODUCT',
  'CUSTOMER_CHANGED_MIND',
  'EXPIRED',
  'TRANSPORT_DAMAGE',
  'OTHER',
] as const;

/**
 * Mirrors `CreateSalesReturnDto` (SPEC-T047 §6). `quantity` is checked client-side only against the
 * eligibility endpoint's own `eligibleQty` hint (advisory) — the server's `SALES_RETURN_004` check
 * remains authoritative.
 */
export const createSalesReturnSchema = z.object({
  invoiceId: z.string().min(1),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        invoiceItemId: z.string().min(1, 'Vui lòng chọn dòng hàng'),
        quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0'),
        reason: z.enum(SALES_RETURN_REASONS),
        reasonNote: z.string().optional(),
        warehouseId: z.string().optional(),
      }),
    )
    .min(1, 'Cần ít nhất 1 sản phẩm')
    .refine(
      (items) => items.every((item) => item.reason !== 'OTHER' || Boolean(item.reasonNote?.trim())),
      { message: 'Vui lòng nhập lý do khi chọn "Khác"' },
    ),
});

export type CreateSalesReturnFormValues = z.input<typeof createSalesReturnSchema>;
export type CreateSalesReturnFormOutput = z.output<typeof createSalesReturnSchema>;
