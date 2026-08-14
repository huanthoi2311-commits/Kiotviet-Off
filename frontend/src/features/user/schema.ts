import { z } from 'zod';

/** Same Zod-gotcha coercion as every other feature's `schema.ts` (e.g. `customer/schema.ts`) —
 * RHF's default value for an untouched optional text input is `''`, which would otherwise fail
 * `.min()`/`.email()` even though the field is optional. */
const optionalMinString = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(min).max(max).optional(),
  );

/**
 * Mirrors `CreateUserDto` (T052.02): `username` 3-50, `fullName` optional, `email` required,
 * `phone`/`branchId` optional, `password` min 8 — no invented complexity rule (D4). `confirmPassword`
 * is frontend-only (never sent to backend, T052.02C §5).
 */
export const createUserSchema = z
  .object({
    username: z.string().min(3).max(50),
    fullName: optionalMinString(1, 150),
    email: z.string().email(),
    phone: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
    branchId: z.string().optional(),
    password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    confirmPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  });

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
