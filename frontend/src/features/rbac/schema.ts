import { z } from 'zod';

/** Mirrors `CreateRoleDto` (T052.03C §4): code 2-50 chars `^[a-z0-9_]+$`, name 2-100, description
 * optional max 255. code is immutable after create — there is no edit-role-metadata UI/endpoint. */
export const createRoleSchema = z.object({
  code: z
    .string()
    .min(2, 'Mã vai trò tối thiểu 2 ký tự')
    .max(50, 'Mã vai trò tối đa 50 ký tự')
    .regex(/^[a-z0-9_]+$/, 'Mã vai trò chỉ gồm chữ thường, số và dấu gạch dưới'),
  name: z.string().min(2, 'Tên vai trò tối thiểu 2 ký tự').max(100, 'Tên vai trò tối đa 100 ký tự'),
  description: z.string().max(255, 'Mô tả tối đa 255 ký tự').optional(),
});

export type CreateRoleFormValues = z.infer<typeof createRoleSchema>;
