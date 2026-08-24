import type { PrismaClient } from '@prisma/client';
import {
  findOverdueActiveTrials,
  getTrialExpiryImpactSummary,
} from './trial-expiry-impact-inspector';

describe('trial-expiry-impact-inspector — T053.06F §12 (read-only operator impact check)', () => {
  function mockPrisma(rows: unknown) {
    return {
      $queryRaw: jest.fn().mockResolvedValue(rows),
    } as unknown as Pick<PrismaClient, '$queryRaw'>;
  }

  describe('getTrialExpiryImpactSummary', () => {
    it('trả về đúng 4 số đếm từ kết quả query', async () => {
      const prisma = mockPrisma([
        {
          total_trial_rows: BigInt(10),
          active_trial_rows: BigInt(7),
          overdue_active_trial_rows: BigInt(3),
          already_expired_rows: BigInt(2),
        },
      ]);

      const result = await getTrialExpiryImpactSummary(prisma);

      expect(result).toEqual({
        totalTrialRows: 10,
        activeTrialRows: 7,
        overdueActiveTrialRows: 3,
        alreadyExpiredRows: 2,
      });
    });

    it('không có dòng TRIAL nào -> toàn bộ 0', async () => {
      const prisma = mockPrisma([
        {
          total_trial_rows: BigInt(0),
          active_trial_rows: BigInt(0),
          overdue_active_trial_rows: BigInt(0),
          already_expired_rows: BigInt(0),
        },
      ]);
      const result = await getTrialExpiryImpactSummary(prisma);
      expect(result.totalTrialRows).toBe(0);
      expect(result.overdueActiveTrialRows).toBe(0);
    });
  });

  describe('findOverdueActiveTrials', () => {
    it('trả về danh sách tổ chức quá hạn, map đúng field', async () => {
      const expiredAt = new Date('2020-01-01T00:00:00.000Z');
      const prisma = mockPrisma([
        {
          organization_id: 'org-1',
          organization_code: 'ORG000001',
          organization_slug: 'acme',
          expired_at: expiredAt,
        },
      ]);

      const result = await findOverdueActiveTrials(prisma);

      expect(result).toEqual([
        {
          organizationId: 'org-1',
          organizationCode: 'ORG000001',
          organizationSlug: 'acme',
          expiredAt,
        },
      ]);
    });

    it('không có tổ chức nào quá hạn -> trả về mảng rỗng', async () => {
      const prisma = mockPrisma([]);
      await expect(findOverdueActiveTrials(prisma)).resolves.toEqual([]);
    });
  });

  describe('[read-only guarantee]', () => {
    it('getTrialExpiryImpactSummary chỉ gọi $queryRaw — không phương thức ghi/xóa nào khác được truy cập', async () => {
      const queryRaw = jest.fn().mockResolvedValue([
        {
          total_trial_rows: BigInt(0),
          active_trial_rows: BigInt(0),
          overdue_active_trial_rows: BigInt(0),
          already_expired_rows: BigInt(0),
        },
      ]);
      const prisma = { $queryRaw: queryRaw } as unknown as Pick<
        PrismaClient,
        '$queryRaw'
      >;

      await getTrialExpiryImpactSummary(prisma);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(Object.keys(prisma)).toEqual(['$queryRaw']);
    });

    it('findOverdueActiveTrials chỉ gọi $queryRaw — không phương thức ghi/xóa nào khác được truy cập', async () => {
      const queryRaw = jest.fn().mockResolvedValue([]);
      const prisma = { $queryRaw: queryRaw } as unknown as Pick<
        PrismaClient,
        '$queryRaw'
      >;

      await findOverdueActiveTrials(prisma);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(Object.keys(prisma)).toEqual(['$queryRaw']);
    });
  });
});
