import { ConflictException } from '@nestjs/common';
import { assertUsageCapacity } from './usage-limit-policy';

describe('assertUsageCapacity (T053.05B — pure policy)', () => {
  it('limit=null => luôn cho phép (không giới hạn), bất kể currentUsage lớn thế nào', () => {
    expect(() =>
      assertUsageCapacity({
        resource: 'USER',
        currentUsage: 999_999,
        limit: null,
      }),
    ).not.toThrow();
  });

  it('currentUsage < limit => cho phép', () => {
    expect(() =>
      assertUsageCapacity({ resource: 'USER', currentUsage: 1, limit: 3 }),
    ).not.toThrow();
  });

  it('currentUsage === limit => từ chối (SUBSCRIPTION_USAGE_LIMIT_REACHED, 409)', () => {
    expect(() =>
      assertUsageCapacity({ resource: 'USER', currentUsage: 3, limit: 3 }),
    ).toThrow(ConflictException);
    try {
      assertUsageCapacity({ resource: 'USER', currentUsage: 3, limit: 3 });
      fail('phải ném lỗi');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse() as {
        errorCode: string;
      };
      expect(response.errorCode).toBe('SUBSCRIPTION_001');
    }
  });

  it('currentUsage > limit (vd sau downgrade) => vẫn từ chối', () => {
    expect(() =>
      assertUsageCapacity({ resource: 'USER', currentUsage: 5, limit: 3 }),
    ).toThrow(ConflictException);
  });

  it('batch: currentUsage + incrementBy <= limit => cho phép', () => {
    expect(() =>
      assertUsageCapacity({
        resource: 'PRODUCT',
        currentUsage: 47,
        limit: 50,
        incrementBy: 3,
      }),
    ).not.toThrow();
  });

  it('batch: currentUsage + incrementBy > limit => từ chối toàn bộ batch (all-or-nothing)', () => {
    expect(() =>
      assertUsageCapacity({
        resource: 'PRODUCT',
        currentUsage: 48,
        limit: 50,
        incrementBy: 3,
      }),
    ).toThrow(ConflictException);
  });

  it('message chứa đúng currentUsage/limit/tên tài nguyên tiếng Việt', () => {
    try {
      assertUsageCapacity({ resource: 'WAREHOUSE', currentUsage: 1, limit: 1 });
      fail('phải ném lỗi');
    } catch (error) {
      const response = (error as ConflictException).getResponse() as {
        message: string;
      };
      expect(response.message).toContain('1/1');
      expect(response.message).toContain('kho');
    }
  });
});
