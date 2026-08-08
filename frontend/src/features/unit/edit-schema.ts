import { z } from 'zod';

/** Mirrors `UpdateUnitDto` (SPEC-UNIT-001 §4/T042) — a dedicated schema, adding `version`. */
export const editUnitSchema = z.object({
  version: z.number().int(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  symbol: z.string().min(1).max(20),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type EditUnitFormValues = z.infer<typeof editUnitSchema>;
