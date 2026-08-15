import { parseEntitlementOverrides } from './entitlement-overrides';

describe('parseEntitlementOverrides (T053.03 §16)', () => {
  it('null => {} (không override)', () => {
    expect(parseEntitlementOverrides(null)).toEqual({});
  });

  it('undefined => {} (không override)', () => {
    expect(parseEntitlementOverrides(undefined)).toEqual({});
  });

  it('object hợp lệ với key/value đúng kiểu được giữ nguyên', () => {
    expect(
      parseEntitlementOverrides({ USER_MANAGEMENT: true, SUPPLIER: false }),
    ).toEqual({ USER_MANAGEMENT: true, SUPPLIER: false });
  });

  it('unknown feature key bị loại bỏ (rejected), không throw', () => {
    expect(
      parseEntitlementOverrides({
        USER_MANAGEMENT: true,
        NOT_A_REAL_FEATURE: true,
      }),
    ).toEqual({ USER_MANAGEMENT: true });
  });

  it('value không phải boolean bị loại bỏ', () => {
    expect(
      parseEntitlementOverrides({
        USER_MANAGEMENT: 'yes' as any,
        SUPPLIER: true,
      }),
    ).toEqual({ SUPPLIER: true });
  });

  it('mảng => {} (không phải object shape hợp lệ)', () => {
    expect(parseEntitlementOverrides(['USER_MANAGEMENT'])).toEqual({});
  });

  it('chuỗi/số => {} (fail-closed, không throw)', () => {
    expect(parseEntitlementOverrides('garbage')).toEqual({});
    expect(parseEntitlementOverrides(123)).toEqual({});
  });

  it('nested object trong value bị loại (không phải boolean)', () => {
    expect(
      parseEntitlementOverrides({
        USER_MANAGEMENT: { nested: true } as any,
      }),
    ).toEqual({});
  });
});
