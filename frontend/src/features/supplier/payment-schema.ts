import { z } from 'zod';

export const SUPPLIER_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET'] as const;

export const SUPPLIER_PAYMENT_METHOD_OPTIONS: {
  value: (typeof SUPPLIER_PAYMENT_METHODS)[number];
  label: string;
}[] = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'CARD', label: 'Thẻ' },
  { value: 'E_WALLET', label: 'Ví điện tử' },
];

/**
 * T052.05C — mirrors `CreateSupplierPaymentDto` exactly (`branchId`, `purchaseOrderId?`,
 * `method`, `amount`, `paidAt`). `supplierId` is intentionally NOT part of this schema — it comes
 * from the current Supplier context (route param), never a free-text/editable form field.
 */
export const supplierPaymentSchema = z.object({
  branchId: z.string().min(1, 'Vui lòng chọn chi nhánh'),
  purchaseOrderId: z.string().optional(),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  amount: z.coerce.number().positive('Số tiền phải lớn hơn 0'),
  paidAt: z.string().min(1, 'Vui lòng chọn ngày thanh toán'),
});

export type SupplierPaymentFormValues = z.input<typeof supplierPaymentSchema>;
export type SupplierPaymentFormOutput = z.output<typeof supplierPaymentSchema>;

/**
 * T052.05C §7 — the exact fields that participate in the backend's idempotency fingerprint
 * (T052.05A.1 §7/§8: the whole `CreateSupplierPaymentDto`, hashed as-is). Changing ANY of these
 * after an attempted submission must mint a NEW Idempotency-Key — reused verbatim by
 * `useSupplierPaymentIdempotencyKey` so the two can never silently drift apart.
 */
export interface SupplierPaymentFingerprint {
  branchId: string;
  supplierId: string;
  purchaseOrderId: string | undefined;
  method: string;
  amount: number;
  paidAt: string;
}
