import { describe, expect, it } from 'vitest';
import { createCategorySchema } from './schema';

const base = { code: 'THOI-TRANG', name: 'Thời trang', status: 'ACTIVE' as const, isActive: true };

describe('createCategorySchema (T036.10)', () => {
  it('accepts the minimal valid input', () => {
    expect(createCategorySchema.safeParse(base).success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    const result = createCategorySchema.safeParse({ ...base, name: 'a' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty code', () => {
    const result = createCategorySchema.safeParse({ ...base, code: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a code longer than 50 characters', () => {
    const result = createCategorySchema.safeParse({ ...base, code: 'x'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('rejects a parentId that is not a UUID', () => {
    const result = createCategorySchema.safeParse({ ...base, parentId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts a description with no length cap (backend has none — regression guard)', () => {
    const result = createCategorySchema.safeParse({ ...base, description: 'x'.repeat(5000) });
    expect(result.success).toBe(true);
  });

  it('accepts imageUrl as an arbitrary non-URL string (backend does not validate format — regression guard)', () => {
    const result = createCategorySchema.safeParse({ ...base, imageUrl: 'not a url at all' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing status', () => {
    const withoutStatus: Record<string, unknown> = { ...base };
    delete withoutStatus.status;
    const result = createCategorySchema.safeParse(withoutStatus);
    expect(result.success).toBe(false);
  });

  it('rejects a missing isActive', () => {
    const withoutIsActive: Record<string, unknown> = { ...base };
    delete withoutIsActive.isActive;
    const result = createCategorySchema.safeParse(withoutIsActive);
    expect(result.success).toBe(false);
  });

  it('coerces a string sortOrder input to a number in the parsed output', () => {
    const result = createCategorySchema.safeParse({ ...base, sortOrder: '3' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortOrder).toBe(3);
    }
  });
});
