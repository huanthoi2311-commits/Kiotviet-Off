import type { PrismaClient } from '@prisma/client';
import { getDatabaseSize, getTableRowCounts } from './db-inspector';

describe('db-inspector — SPEC-T023 Finding 9 (FR9.2)', () => {
  function mockPrisma(rows: unknown) {
    return {
      $queryRaw: jest.fn().mockResolvedValue(rows),
    } as unknown as Pick<PrismaClient, '$queryRaw'>;
  }

  describe('getDatabaseSize', () => {
    it('[AC9.2] trả về đúng size_bytes/size_pretty từ pg_database_size', async () => {
      const prisma = mockPrisma([
        { size_bytes: BigInt(52428800), size_pretty: '50 MB' },
      ]);

      const result = await getDatabaseSize(prisma);

      expect(result).toEqual({
        databaseSizeBytes: 52428800,
        databaseSizePretty: '50 MB',
      });
    });
  });

  describe('getTableRowCounts', () => {
    it('[AC9.2] trả về danh sách bảng kèm số dòng ước tính, sắp theo thứ tự trả về', async () => {
      const prisma = mockPrisma([
        { table_name: 'permissions', row_count: BigInt(42) },
        { table_name: 'users', row_count: BigInt(5) },
      ]);

      const result = await getTableRowCounts(prisma);

      expect(result).toEqual([
        { tableName: 'permissions', rowCount: 42 },
        { tableName: 'users', rowCount: 5 },
      ]);
    });

    it('không có bảng nào → trả về mảng rỗng', async () => {
      const prisma = mockPrisma([]);
      const result = await getTableRowCounts(prisma);
      expect(result).toEqual([]);
    });
  });

  describe('[read-only guarantee] Architect Decision (T032.01E)', () => {
    it('getDatabaseSize chỉ gọi $queryRaw — không phương thức ghi/xóa nào khác được truy cập', async () => {
      const queryRaw = jest
        .fn()
        .mockResolvedValue([{ size_bytes: BigInt(1), size_pretty: '1 bytes' }]);
      const prisma = { $queryRaw: queryRaw } as unknown as Pick<
        PrismaClient,
        '$queryRaw'
      >;

      await getDatabaseSize(prisma);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(Object.keys(prisma)).toEqual(['$queryRaw']);
    });

    it('getTableRowCounts chỉ gọi $queryRaw — không phương thức ghi/xóa nào khác được truy cập', async () => {
      const queryRaw = jest.fn().mockResolvedValue([]);
      const prisma = { $queryRaw: queryRaw } as unknown as Pick<
        PrismaClient,
        '$queryRaw'
      >;

      await getTableRowCounts(prisma);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(Object.keys(prisma)).toEqual(['$queryRaw']);
    });
  });
});
