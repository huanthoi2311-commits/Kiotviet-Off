import { z } from 'zod';

const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url('website phải là URL hợp lệ').optional(),
);

/** Mirrors `UpdateSupplierDto` (T049 spec §4): no `code` (immutable), no `status` (separate
 * Activate/Deactivate/Archive/Restore routes), `version` required (Optimistic Lock). */
export const editSupplierSchema = z.object({
  version: z.number().int(),
  taxCode: z.string().optional(),
  companyName: z.string().min(2).max(255).optional(),
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

export type EditSupplierFormValues = z.infer<typeof editSupplierSchema>;
