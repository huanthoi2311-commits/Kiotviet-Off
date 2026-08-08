import { z } from 'zod';

/**
 * Mirrors `UpdateBrandDto` (SPEC-BRAND-001 §4/T041.05) — a dedicated schema,
 * not `createBrandSchema` reused, matching Category's own precedent
 * (T036.02 AD-4): Edit needs `version` (Optimistic Lock), Create doesn't.
 */
export const editBrandSchema = z.object({
  version: z.number().int(),
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(255),
  logo: z.string().optional(),
  description: z.string().optional(),
  website: z
    .union([z.string().url({ message: 'website phải là URL hợp lệ' }), z.literal('')])
    .optional(),
  country: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type EditBrandFormValues = z.infer<typeof editBrandSchema>;
