import { PrismaService } from '../../../../prisma/prisma.service';
import { VoucherConcurrencyConflictError } from '../../domain/repositories/voucher.repository.interface';
import { PrismaVoucherRepository } from './prisma-voucher.repository';

describe('PrismaVoucherRepository', () => {
  let repository: PrismaVoucherRepository;
  let prisma: {
    voucher: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  const rawVoucher = {
    id: 'voucher-1',
    code: 'SALE10',
    type: 'PERCENTAGE',
    value: { toString: () => '10' },
    minOrderAmount: { toString: () => '100000' },
    maxDiscount: { toString: () => '50000' },
    usageLimit: 100,
    usedCount: 5,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'ACTIVE',
  };

  beforeEach(() => {
    prisma = {
      voucher: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    repository = new PrismaVoucherRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('findActiveByCode', () => {
    it('trả về null khi không tìm thấy mã', async () => {
      prisma.voucher.findFirst.mockResolvedValue(null);
      const result = await repository.findActiveByCode('org-1', 'NOPE');
      expect(result).toBeNull();
    });

    it('trả về entity khi tìm thấy, chuyển Decimal thành string', async () => {
      prisma.voucher.findFirst.mockResolvedValue(rawVoucher);
      const result = await repository.findActiveByCode('org-1', 'SALE10');
      expect(result?.code).toBe('SALE10');
      expect(result?.value).toBe('10');
      expect(result?.minOrderAmount).toBe('100000');
    });

    it('trả về null cho minOrderAmount/maxDiscount khi voucher không có', async () => {
      prisma.voucher.findFirst.mockResolvedValue({
        ...rawVoucher,
        minOrderAmount: null,
        maxDiscount: null,
      });
      const result = await repository.findActiveByCode('org-1', 'SALE10');
      expect(result?.minOrderAmount).toBeNull();
      expect(result?.maxDiscount).toBeNull();
    });
  });

  describe('incrementUsage', () => {
    it('tăng usedCount qua updateMany điều kiện usedCount = previousUsedCount', async () => {
      prisma.voucher.updateMany.mockResolvedValue({ count: 1 });
      await repository.incrementUsage('voucher-1', 5);

      expect(prisma.voucher.updateMany).toHaveBeenCalledWith({
        where: { id: 'voucher-1', usedCount: 5 },
        data: { usedCount: { increment: 1 } },
      });
    });

    it('ném VoucherConcurrencyConflictError khi updateMany không khớp dòng nào', async () => {
      prisma.voucher.updateMany.mockResolvedValue({ count: 0 });
      await expect(repository.incrementUsage('voucher-1', 5)).rejects.toThrow(
        VoucherConcurrencyConflictError,
      );
    });

    it('dùng thẳng tx được truyền vào, không dùng this.prisma', async () => {
      const tx = {
        voucher: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      await repository.incrementUsage('voucher-1', 5, tx as never);

      expect(prisma.voucher.updateMany).not.toHaveBeenCalled();
      expect(tx.voucher.updateMany).toHaveBeenCalled();
    });
  });
});
