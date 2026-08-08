import { z } from 'zod';

/**
 * Mirrors `CreateBrandDto` (SPEC-BRAND-001 §4/T041.05): `logo`/`description`/
 * `country` are plain optional strings with no extra frontend constraint —
 * the backend validates none. `website` mirrors the backend's `@IsUrl()`:
 * empty is allowed (optional field), but a non-empty value must be a real
 * URL — `z.literal('')` alongside `.url()` lets a blank input pass while
 * still rejecting a non-URL string, matching backend behavior exactly
 * (unlike Category's `imageUrl`, which has no such constraint).
 */
export const createBrandSchema = z.object({
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

export type CreateBrandFormValues = z.infer<typeof createBrandSchema>;
