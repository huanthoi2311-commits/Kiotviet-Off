import { z } from 'zod';

/**
 * Mirrors `UpdateCategoryDto` (SPEC-T037 §2/§6): `imageUrl` has no `.url()`
 * and `description` has no `.max()` — the backend validates neither
 * (unchanged from Create). A dedicated schema, not `createCategorySchema`
 * reused (T036.02 AD-4, T037.02 §20) — Edit needs `version` and different
 * field semantics (`parentId: undefined` means "clear to null" here, not
 * "no parent" as in Create, §7).
 */
export const editCategorySchema = z.object({
  version: z.number().int(),
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  parentId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  isActive: z.boolean(),
});

export type EditCategoryFormValues = z.infer<typeof editCategorySchema>;
