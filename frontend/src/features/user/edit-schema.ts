import { z } from 'zod';

const optionalMinString = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(min).max(max).optional(),
  );

/**
 * Mirrors `UpdateUserDto` (T052.02): fullName/phone/avatar/branchId only — no username, no email,
 * no password/status (dedicated endpoints), no `version` (D6, no CAS on User).
 */
export const editUserSchema = z.object({
  fullName: optionalMinString(1, 150),
  phone: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
  avatar: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
  branchId: z.string().optional(),
});

export type EditUserFormValues = z.infer<typeof editUserSchema>;

/** D4 — admin resets another user's password. Same policy as create (min 8, no complexity rule). */
export const resetUserPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    confirmPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type ResetUserPasswordFormValues = z.infer<typeof resetUserPasswordSchema>;
