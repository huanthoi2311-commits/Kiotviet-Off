import { describe, expect, it } from 'vitest';
import { editCategorySchema } from './edit-schema';

const base = {
  version: 1,
  code: 'THOI-TRANG',
  name: 'Thời trang',
  status: 'ACTIVE' as const,
  isActive: true,
};

describe('editCategorySchema (T037.10)', () => {
  it('accepts the minimal valid input', () => {
    expect(editCategorySchema.safeParse(base).success).toBe(true);
  });

  it('rejects a missing version', () => {
    const withoutVersion: Record<string, unknown> = { ...base };
    delete withoutVersion.version;
    expect(editCategorySchema.safeParse(withoutVersion).success).toBe(false);
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(editCategorySchema.safeParse({ ...base, name: 'a' }).success).toBe(false);
  });

  it('rejects an empty code', () => {
    expect(editCategorySchema.safeParse({ ...base, code: '' }).success).toBe(false);
  });

  it('rejects a code longer than 50 characters', () => {
    expect(editCategorySchema.safeParse({ ...base, code: 'x'.repeat(51) }).success).toBe(false);
  });

  it('rejects a parentId that is not a UUID', () => {
    expect(editCategorySchema.safeParse({ ...base, parentId: 'not-a-uuid' }).success).toBe(false);
  });

  it('accepts a description with no length cap (backend has none — regression guard)', () => {
    expect(editCategorySchema.safeParse({ ...base, description: 'x'.repeat(5000) }).success).toBe(
      true,
    );
  });

  it('accepts imageUrl as an arbitrary non-URL string (backend does not validate format — regression guard)', () => {
    expect(editCategorySchema.safeParse({ ...base, imageUrl: 'not a url at all' }).success).toBe(
      true,
    );
  });

  it('rejects a missing status', () => {
    const withoutStatus: Record<string, unknown> = { ...base };
    delete withoutStatus.status;
    expect(editCategorySchema.safeParse(withoutStatus).success).toBe(false);
  });

  it('rejects a missing isActive', () => {
    const withoutIsActive: Record<string, unknown> = { ...base };
    delete withoutIsActive.isActive;
    expect(editCategorySchema.safeParse(withoutIsActive).success).toBe(false);
  });

  it('accepts parentId: undefined (means "clear to null" downstream, translated at the component level, not the schema — §7)', () => {
    expect(editCategorySchema.safeParse({ ...base, parentId: undefined }).success).toBe(true);
  });
});
