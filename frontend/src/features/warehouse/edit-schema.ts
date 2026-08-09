import { z } from 'zod';

/** Mirrors `UpdateWarehouseDto` — all optional, no `version` field (Warehouse has no Optimistic Lock). */
export const editWarehouseSchema = z.object({
  branchId: z.string().min(1, 'Vui lòng chọn chi nhánh'),
  managerId: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(3, 'Tên kho phải từ 3 đến 255 ký tự').max(255),
  type: z.enum(['MAIN', 'RETAIL', 'ONLINE', 'RETURN', 'DAMAGED', 'TRANSIT', 'CUSTOM']).optional(),
  address: z.string().optional(),
  phone: z
    .union([z.string().regex(/^(0|\+84)\d{9,10}$/, 'Số điện thoại không hợp lệ'), z.literal('')])
    .optional(),
  email: z.union([z.string().email('Email không hợp lệ'), z.literal('')]).optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export type EditWarehouseFormValues = z.infer<typeof editWarehouseSchema>;
