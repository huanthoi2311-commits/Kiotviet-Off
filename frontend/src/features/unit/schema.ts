import { z } from 'zod';

/**
 * Mirrors `CreateUnitDto` (SPEC-UNIT-001 §4/T042): `name` is `min(1)`, not
 * `min(2)` like Category/Brand — the backend genuinely validates differently
 * here. `symbol` is required (1-20 chars), unlike anything on Category/
 * Brand. No description/logo/website/country — Unit has none of these.
 */
export const createUnitSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  symbol: z.string().min(1).max(20),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type CreateUnitFormValues = z.infer<typeof createUnitSchema>;
