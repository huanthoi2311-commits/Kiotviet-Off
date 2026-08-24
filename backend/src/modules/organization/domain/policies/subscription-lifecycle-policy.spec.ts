import { isSubscriptionExpired } from './subscription-lifecycle-policy';

describe('isSubscriptionExpired (T053.06F)', () => {
  const now = new Date('2026-08-24T00:00:00.000Z');

  // U1
  it('TRIAL ACTIVE trước hạn -> chưa hết hạn', () => {
    expect(
      isSubscriptionExpired(
        {
          plan: 'TRIAL',
          status: 'ACTIVE',
          expiredAt: new Date('2026-08-25T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  // U2
  it('TRIAL ACTIVE đúng thời điểm expiredAt (biên bao gồm) -> đã hết hạn', () => {
    expect(
      isSubscriptionExpired(
        { plan: 'TRIAL', status: 'ACTIVE', expiredAt: now },
        now,
      ),
    ).toBe(true);
  });

  // U3
  it('TRIAL ACTIVE sau expiredAt -> đã hết hạn', () => {
    expect(
      isSubscriptionExpired(
        {
          plan: 'TRIAL',
          status: 'ACTIVE',
          expiredAt: new Date('2026-08-23T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  // U4
  it('TRIAL đã persist EXPIRED -> đã hết hạn (không cần đọc expiredAt nữa)', () => {
    expect(
      isSubscriptionExpired(
        { plan: 'TRIAL', status: 'EXPIRED', expiredAt: null },
        now,
      ),
    ).toBe(true);
  });

  // U5
  it('FREE/BASIC/PRO/ENTERPRISE không bao giờ bị coi là hết hạn, kể cả nếu expiredAt vô tình khác null', () => {
    (['FREE', 'BASIC', 'PRO', 'ENTERPRISE'] as const).forEach((plan) => {
      expect(
        isSubscriptionExpired(
          {
            plan,
            status: 'ACTIVE',
            expiredAt: new Date('2020-01-01T00:00:00.000Z'),
          },
          now,
        ),
      ).toBe(false);
    });
  });

  it('TRIAL ACTIVE nhưng expiredAt null -> chưa hết hạn (không suy diễn hạn mặc định)', () => {
    expect(
      isSubscriptionExpired(
        { plan: 'TRIAL', status: 'ACTIVE', expiredAt: null },
        now,
      ),
    ).toBe(false);
  });

  it('TRIAL CANCELLED -> KHÔNG coi là expired (trạng thái riêng, ngoài phạm vi T053.06F)', () => {
    expect(
      isSubscriptionExpired(
        {
          plan: 'TRIAL',
          status: 'CANCELLED',
          expiredAt: new Date('2020-01-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('mặc định now = new Date() khi không truyền tham số (không bắt buộc gọi phải truyền now)', () => {
    expect(
      isSubscriptionExpired({
        plan: 'TRIAL',
        status: 'ACTIVE',
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }),
    ).toBe(false);
  });
});
