import { z } from 'zod';

const CUSTOMER_TYPES = ['RETAIL', 'WHOLESALE', 'VIP', 'DEALER', 'COMPANY'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

/** Empty string is coerced to `undefined` before the format/length check — RHF's default value
 * for an untouched optional text input is `''`, which would otherwise fail `.min()`/`.email()`
 * even though the field is optional (a genuine Zod gotcha, not present elsewhere in this codebase
 * since every other `.min()` string field here is required, never optional). */
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
 * Mirrors `CreateCustomerDto` (T048 spec §4): `code` optional (auto-generates
 * CUSxxxxxx if omitted), `status` never accepted (always ACTIVE on create).
 */
export const createCustomerSchema = z.object({
  code: optionalMinString(1, 50),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  fullName: z.string().min(2).max(255),
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

export type CreateCustomerFormValues = z.infer<typeof createCustomerSchema>;
