import { z } from 'zod';

/** Empty string is coerced to `undefined` before the format check — same Zod gotcha documented in
 * the Customer feature's own `schema.ts` (RHF's default value for an untouched optional text
 * input is `''`, which would otherwise fail `.email()`/`.url()` even though the field is optional). */
const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url('website phải là URL hợp lệ').optional(),
);

const optionalCode = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).max(50).optional(),
);

/** Mirrors `CreateSupplierDto` (T049 spec §4): `code` optional (auto-generates NCCxxxxxx if
 * omitted), `status` never accepted (always ACTIVE on create — the DTO's `status` field is
 * Import-only, not exposed by this Create form). */
export const createSupplierSchema = z.object({
  code: optionalCode,
  taxCode: z.string().optional(),
  companyName: z.string().min(2).max(255),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: optionalEmail,
  website: optionalUrl,
  address: z.string().optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  ward: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  paymentTerm: z.coerce.number().int().min(0).optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  note: z.string().optional(),
});

export type CreateSupplierFormValues = z.infer<typeof createSupplierSchema>;
