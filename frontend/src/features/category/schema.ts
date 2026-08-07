import { z } from 'zod';

/**
 * Mirrors `CreateCategoryDto` (SPEC-T036 §1/§3): `imageUrl` is deliberately
 * NOT `.url()` and `description` deliberately has no `.max()` — the
 * backend validates neither. A dedicated schema, not shared with the
 * future Edit schema (T036-CATEGORY-CREATE-SPEC.md AD-4) — Edit needs
 * `version` and different field optionality per PATCH semantics.
 */
export const createCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  parentId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().optional(),
});

export type CreateCategoryFormValues = z.infer<typeof createCategorySchema>;
