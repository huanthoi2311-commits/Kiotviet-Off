import { InternalServerErrorException } from '@nestjs/common';
import { UsageLimitService } from './usage-limit.service';

describe('UsageLimitService (T053.05B)', () => {
  let service: UsageLimitService;
  let tx: {
    $executeRaw: jest.Mock;
    organizationSubscription: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    service = new UsageLimitService();
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      organizationSubscription: { findUnique: jest.fn() },
    };
  });

  describe('lock()', () => {
    it('gọi tx.$executeRaw dạng tagged-template (parameterized), KHÔNG $executeRawUnsafe/nối chuỗi', async () => {
      await service.lock(tx as never, 'org-1', 'WAREHOUSE');
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      // Tagged-template gọi $executeRaw với 1 mảng TemplateStringsArray + các giá trị tham số theo
      // sau — không phải 1 chuỗi SQL đã nối sẵn (điều này tự động đúng vì cú pháp
      // `tx.$executeRaw\`...${x}...\`` không thể tạo ra lời gọi dạng chuỗi đơn).
      const [strings, ...values] = tx.$executeRaw.mock.calls[0];
      expect(Array.isArray(strings)).toBe(true);
      expect(values).toEqual(['org-1', 'WAREHOUSE']);
      expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    });

    it('lock cho 2 tổ chức khác nhau dùng tham số organizationId khác nhau', async () => {
      await service.lock(tx as never, 'org-A', 'USER');
      await service.lock(tx as never, 'org-B', 'USER');
      const [, orgA] = tx.$executeRaw.mock.calls[0];
      const [, orgB] = tx.$executeRaw.mock.calls[1];
      expect(orgA).not.toBe(orgB);
    });
  });

  describe('getLimit()', () => {
    it('đọc đúng cột max* tương ứng resource qua tx (không phải PrismaService toàn cục)', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue({
        maxUser: 3,
        maxBranch: 1,
        maxWarehouse: 1,
        maxProduct: 50,
        maxCustomer: 50,
      });

      await expect(
        service.getLimit(tx as never, 'org-1', 'USER'),
      ).resolves.toBe(3);
      await expect(
        service.getLimit(tx as never, 'org-1', 'BRANCH'),
      ).resolves.toBe(1);
      await expect(
        service.getLimit(tx as never, 'org-1', 'WAREHOUSE'),
      ).resolves.toBe(1);
      await expect(
        service.getLimit(tx as never, 'org-1', 'PRODUCT'),
      ).resolves.toBe(50);
      await expect(
        service.getLimit(tx as never, 'org-1', 'CUSTOMER'),
      ).resolves.toBe(50);
      expect(tx.organizationSubscription.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        select: {
          maxUser: true,
          maxBranch: true,
          maxWarehouse: true,
          maxProduct: true,
          maxCustomer: true,
        },
      });
    });

    it('null limit (FREE/ENTERPRISE) được trả nguyên vẹn, không thay bằng sentinel', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue({
        maxUser: null,
        maxBranch: null,
        maxWarehouse: null,
        maxProduct: null,
        maxCustomer: null,
      });
      await expect(
        service.getLimit(tx as never, 'org-1', 'USER'),
      ).resolves.toBeNull();
    });

    it('thiếu OrganizationSubscription => InternalServerErrorException (fail closed, KHÔNG coi là unlimited)', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(null);
      await expect(
        service.getLimit(tx as never, 'org-missing-sub', 'USER'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
