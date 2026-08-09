import { z } from 'zod';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET'] as const;
const MANUAL_DISCOUNT_TYPES = ['PERCENT', 'AMOUNT', 'FIXED_PRICE', 'BUY_X_GET_Y'] as const;

/** Mirrors `CheckoutDto` (SPEC-T046 §5). No `items` field — Checkout reads the server Cart implicitly. */
export const checkoutSchema = z
  .object({
    branchId: z.string().min(1, 'Vui lòng chọn chi nhánh'),
    warehouseId: z.string().min(1, 'Vui lòng chọn kho'),
    customerId: z.string().optional(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    voucherCode: z.string().optional(),
    pointsToUse: z.coerce.number().int().positive().optional().or(z.literal('')),
    useManualDiscount: z.boolean().optional(),
    manualDiscountType: z.enum(MANUAL_DISCOUNT_TYPES).optional(),
    manualDiscountValue: z.coerce.number().optional().or(z.literal('')),
    manualDiscountProductId: z.string().optional(),
    manualDiscountBuyQuantity: z.coerce.number().int().positive().optional().or(z.literal('')),
    manualDiscountGetQuantity: z.coerce.number().int().positive().optional().or(z.literal('')),
  })
  .refine((data) => !data.pointsToUse || data.customerId, {
    message: 'Cần chọn khách hàng để dùng điểm tích lũy',
    path: ['pointsToUse'],
  });

export type CheckoutFormValues = z.input<typeof checkoutSchema>;
export type CheckoutFormOutput = z.output<typeof checkoutSchema>;
