import { z } from 'zod';

/** Mirrors `CreateTransferDto` (SPEC-T044 §4.2). No Edit schema — Transfer has no update endpoint. */
export const createTransferSchema = z
  .object({
    fromWarehouseId: z.string().min(1, 'Vui lòng chọn kho nguồn'),
    toWarehouseId: z.string().min(1, 'Vui lòng chọn kho đích'),
    note: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, 'Vui lòng chọn sản phẩm'),
          quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0'),
        }),
      )
      .min(1, 'Cần ít nhất 1 sản phẩm'),
  })
  .refine(
    (data) =>
      !data.fromWarehouseId || !data.toWarehouseId || data.fromWarehouseId !== data.toWarehouseId,
    { message: 'Kho nguồn và kho đích phải khác nhau', path: ['toWarehouseId'] },
  );

export type CreateTransferFormValues = z.input<typeof createTransferSchema>;
export type CreateTransferFormOutput = z.output<typeof createTransferSchema>;
