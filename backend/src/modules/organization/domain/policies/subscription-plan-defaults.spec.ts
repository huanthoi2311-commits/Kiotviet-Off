import {
  computeSubscriptionDefaults,
  SUBSCRIPTION_PLAN_LIMITS,
  TRIAL_DURATION_DAYS,
} from './subscription-plan-defaults';

describe('subscription-plan-defaults (T053.02 D3 — centralized policy)', () => {
  describe('SUBSCRIPTION_PLAN_LIMITS', () => {
    // FREE — D3: "Do NOT invent limits" — must match the pre-existing, already-shipped default
    // (schema.prisma has no @default on any max* column, i.e. NULL/unlimited).
    it('FREE — every limit is null (unchanged pre-existing behavior)', () => {
      expect(SUBSCRIPTION_PLAN_LIMITS.FREE).toEqual({
        maxBranch: null,
        maxUser: null,
        maxWarehouse: null,
        maxProduct: null,
        maxCustomer: null,
        storageLimitGB: null,
      });
    });

    it('TRIAL — matches Architect D3 exactly', () => {
      expect(SUBSCRIPTION_PLAN_LIMITS.TRIAL).toEqual({
        maxBranch: 1,
        maxUser: 3,
        maxWarehouse: 1,
        maxProduct: 50,
        maxCustomer: 50,
        storageLimitGB: 1,
      });
    });

    it('BASIC — matches Architect D3 exactly', () => {
      expect(SUBSCRIPTION_PLAN_LIMITS.BASIC).toEqual({
        maxBranch: 2,
        maxUser: 5,
        maxWarehouse: 2,
        maxProduct: 500,
        maxCustomer: null,
        storageLimitGB: 5,
      });
    });

    it('PRO — matches Architect D3 exactly', () => {
      expect(SUBSCRIPTION_PLAN_LIMITS.PRO).toEqual({
        maxBranch: 10,
        maxUser: 20,
        maxWarehouse: 10,
        maxProduct: null,
        maxCustomer: null,
        storageLimitGB: 25,
      });
    });

    it('ENTERPRISE — unlimited/null by default (D3)', () => {
      expect(SUBSCRIPTION_PLAN_LIMITS.ENTERPRISE).toEqual({
        maxBranch: null,
        maxUser: null,
        maxWarehouse: null,
        maxProduct: null,
        maxCustomer: null,
        storageLimitGB: null,
      });
    });
  });

  describe('computeSubscriptionDefaults', () => {
    it('TRIAL: expiredAt = now + TRIAL_DURATION_DAYS, using the EXISTING expiredAt field (no new column)', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const result = computeSubscriptionDefaults('TRIAL', now);
      expect(result.expiredAt).toEqual(
        new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000),
      );
      expect(result.maxUser).toBe(3);
    });

    it.each(['FREE', 'BASIC', 'PRO', 'ENTERPRISE'] as const)(
      '%s: expiredAt is null (no automatic expiry)',
      (plan) => {
        const result = computeSubscriptionDefaults(plan, new Date());
        expect(result.expiredAt).toBeNull();
      },
    );

    it('defaults `now` to the real current time when omitted', () => {
      const before = Date.now();
      const result = computeSubscriptionDefaults('TRIAL');
      const after = Date.now();
      expect(result.expiredAt!.getTime()).toBeGreaterThanOrEqual(
        before + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
      );
      expect(result.expiredAt!.getTime()).toBeLessThanOrEqual(
        after + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
      );
    });
  });
});
