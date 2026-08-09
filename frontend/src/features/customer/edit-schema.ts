import { z } from 'zod';

const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'VIP', 'DEALER', 'COMPANY'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

/** Empty string is coerced to `undefined` before the format/length check — same Zod gotcha as
 * `schema.ts`'s own `optionalMinString`/`optionalEmail` (not shared across the two files, matching
 * this codebase's established convention of dedicated Create/Edit schemas, T036-CATEGORY §AD-4). */
const optionalMinString = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(min).max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
);

/**
 * Mirrors `UpdateCustomerDto` (T048 spec §4): no `code` (immutable, BR03),
 * no `status` (separate Activate/Deactivate/Archive/Restore routes),
 * `version` required (Optimistic Lock).
 */
export const editCustomerSchema = z.object({
  version: z.number().int(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  fullName: optionalMinString(2, 255),
  phone: optionalMinString(8, 20),
  email: optionalEmail,
  birthday: z.string().optional(),
  gender: z.enum(GENDERS).optional(),
  taxCode: z.string().optional(),
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  address: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  ward: z.string().optional(),
  avatar: z.string().optional(),
  note: z.string().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  paymentTermDays: z.coerce.number().int().min(0).optional(),
});

export type EditCustomerFormValues = z.infer<typeof editCustomerSchema>;
