import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
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
    function row(overrides: Record<string, unknown> = {}) {
      return {
        plan: 'PRO',
        status: 'ACTIVE',
        expiredAt: null,
        maxUser: 3,
        maxBranch: 1,
        maxWarehouse: 1,
        maxProduct: 50,
        maxCustomer: 50,
        ...overrides,
      };
    }

    it('đọc đúng cột max* tương ứng resource qua tx (không phải PrismaService toàn cục)', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(row());

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
          plan: true,
          status: true,
          expiredAt: true,
          maxUser: true,
          maxBranch: true,
          maxWarehouse: true,
          maxProduct: true,
          maxCustomer: true,
        },
      });
    });

    it('null limit (FREE/ENTERPRISE) được trả nguyên vẹn, không thay bằng sentinel', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(
        row({
          plan: 'FREE',
          maxUser: null,
          maxBranch: null,
          maxWarehouse: null,
          maxProduct: null,
          maxCustomer: null,
        }),
      );
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

    // U11/U6 (T053.06F §20) — TRIAL hết hạn (persisted EXPIRED) chặn TRƯỚC khi trả limit.
    it('U11 — TRIAL persisted EXPIRED => ForbiddenException (SUBSCRIPTION_002), KHÔNG trả limit', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(
        row({ plan: 'TRIAL', status: 'EXPIRED', maxUser: 3 }),
      );
      await expect(
        service.getLimit(tx as never, 'org-1', 'USER'),
      ).rejects.toThrow(ForbiddenException);
    });

    // U10 tương đương ở tầng quota — request-time fail-safe: status vẫn ACTIVE nhưng expiredAt
    // đã qua (scheduler chưa chạy) vẫn phải chặn ngay.
    it('TRIAL ACTIVE nhưng quá hạn (scheduler chưa chạy) vẫn bị chặn ngay (request-time fail-safe)', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(
        row({
          plan: 'TRIAL',
          status: 'ACTIVE',
          expiredAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
      );
      await expect(
        service.getLimit(tx as never, 'org-1', 'USER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('mã lỗi trả về đúng SUBSCRIPTION_002', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(
        row({ plan: 'TRIAL', status: 'EXPIRED' }),
      );
      try {
        await service.getLimit(tx as never, 'org-1', 'USER');
        fail('phải ném lỗi');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as ForbiddenException).getResponse() as {
          errorCode: string;
        };
        expect(response.errorCode).toBe('SUBSCRIPTION_002');
      }
    });

    // U12 — TRIAL còn hạn giữ nguyên hành vi hiện có (trả limit bình thường).
    it('U12 — TRIAL còn hạn (ACTIVE, expiredAt tương lai) vẫn trả đúng limit như trước, không bị chặn', async () => {
      tx.organizationSubscription.findUnique.mockResolvedValue(
        row({
          plan: 'TRIAL',
          status: 'ACTIVE',
          expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          maxUser: 3,
        }),
      );
      await expect(
        service.getLimit(tx as never, 'org-1', 'USER'),
      ).resolves.toBe(3);
    });

    // U13 — non-TRIAL plans không bao giờ bị chặn bởi logic này, kể cả nếu expiredAt vô tình
    // khác null (dữ liệu không hợp lệ giả định).
    it('U13 — FREE/BASIC/PRO/ENTERPRISE không bao giờ bị chặn bởi logic hết hạn, kể cả expiredAt khác null bất thường', async () => {
      for (const plan of ['FREE', 'BASIC', 'PRO', 'ENTERPRISE']) {
        tx.organizationSubscription.findUnique.mockResolvedValue(
          row({
            plan,
            status: 'ACTIVE',
            expiredAt: new Date('2020-01-01T00:00:00.000Z'),
            maxUser: 5,
          }),
        );
        await expect(
          service.getLimit(tx as never, 'org-1', 'USER'),
        ).resolves.toBe(5);
      }
    });
  });
});
