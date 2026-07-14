import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaPurchaseReportRepository } from './prisma-purchase-report.repository';

describe('PrismaPurchaseReportRepository', () => {
  let repository: PrismaPurchaseReportRepository;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    repository = new PrismaPurchaseReportRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('getBreakdown', () => {
    it('map đúng entity (Decimal→string, bigint→number) và phân trang cho SUPPLIER', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            key: 'supplier-1',
            code: 'NCC001',
            label: 'NCC A',
            totalAmount: new Prisma.Decimal(500000),
            totalQuantity: new Prisma.Decimal(50),
            orderCount: 5n,
          },
        ])
        .mockResolvedValueOnce([{ total: 1n }]);

      const result = await repository.getBreakdown({
        organizationId: 'org-1',
        groupBy: 'SUPPLIER',
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        key: 'supplier-1',
        code: 'NCC001',
        label: 'NCC A',
        totalAmount: '500000',
        totalQuantity: '50',
        orderCount: 5,
      });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('MONTH: label rỗng dùng nhãn mặc định "(Không xác định)"', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            key: null,
            code: null,
            label: null,
            totalAmount: new Prisma.Decimal(0),
            totalQuantity: new Prisma.Decimal(0),
            orderCount: 0n,
          },
        ])
        .mockResolvedValueOnce([{ total: 1n }]);

      const result = await repository.getBreakdown({
        organizationId: 'org-1',
        groupBy: 'USER',
        page: 1,
        limit: 20,
      });

      expect(result.items[0].label).toBe('(Không xác định)');
      expect(result.items[0].key).toBe('');
    });

    it.each([
      'SUPPLIER',
      'PRODUCT',
      'WAREHOUSE',
      'MONTH',
      'USER',
      'CATEGORY',
    ] as const)('hỗ trợ dimension %s', async (groupBy) => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0n }]);
      const result = await repository.getBreakdown({
        organizationId: 'org-1',
        groupBy,
        page: 1,
        limit: 20,
      });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('áp dụng dateFrom/dateTo vào câu truy vấn khi có filter', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0n }]);
      await repository.getBreakdown({
        organizationId: 'org-1',
        groupBy: 'SUPPLIER',
        dateFrom: new Date('2026-01-01'),
        dateTo: new Date('2026-01-31'),
        page: 1,
        limit: 20,
      });

      const firstCallSql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(firstCallSql.sql).toContain('po."createdAt" >=');
      expect(firstCallSql.sql).toContain('po."createdAt" <=');
    });
  });

  describe('getDashboard', () => {
    it('tổng hợp totals + averageCost + top breakdowns (ủy quyền cho getBreakdown)', async () => {
      const breakdownSpy = jest
        .spyOn(repository, 'getBreakdown')
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 5 });

      prisma.$queryRaw
        .mockResolvedValueOnce([
          { totalAmount: new Prisma.Decimal(1000000), totalOrders: 10n },
        ])
        .mockResolvedValueOnce([{ averageCost: new Prisma.Decimal(9000) }]);

      const result = await repository.getDashboard({ organizationId: 'org-1' });

      expect(result.totalAmount).toBe('1000000');
      expect(result.totalOrders).toBe(10);
      expect(result.averageCost).toBe('9000');
      expect(breakdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'SUPPLIER', limit: 5 }),
      );
      expect(breakdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'PRODUCT', limit: 5 }),
      );
      expect(breakdownSpy).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'MONTH', limit: 12 }),
      );
    });

    it('trả về 0 khi chưa có Purchase Order nào (totals/averageCost null)', async () => {
      jest
        .spyOn(repository, 'getBreakdown')
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 5 });
      prisma.$queryRaw
        .mockResolvedValueOnce([{ totalAmount: null, totalOrders: 0n }])
        .mockResolvedValueOnce([{ averageCost: null }]);

      const result = await repository.getDashboard({ organizationId: 'org-1' });
      expect(result.totalAmount).toBe('0');
      expect(result.totalOrders).toBe(0);
      expect(result.averageCost).toBe('0');
    });
  });
});
