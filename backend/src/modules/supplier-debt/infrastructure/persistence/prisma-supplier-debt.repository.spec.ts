import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SupplierPaymentExceedsBalanceError } from '../../domain/repositories/supplier-debt.repository.interface';
import { PrismaSupplierDebtRepository } from './prisma-supplier-debt.repository';

const rawSupplier = {
  id: 'supplier-1',
  code: 'NCC001',
  companyName: 'NCC A',
};

const rawPayment = {
  id: 'payment-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  supplierId: 'supplier-1',
  purchaseOrderId: null,
  method: 'CASH',
  direction: 'OUT',
  amount: new Prisma.Decimal(500000),
  paidAt: new Date('2026-01-01'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

describe('PrismaSupplierDebtRepository', () => {
  let repository: PrismaSupplierDebtRepository;
  let prisma: {
    supplier: { findMany: jest.Mock; count: jest.Mock };
    debt: { aggregate: jest.Mock; groupBy: jest.Mock };
    payment: {
      aggregate: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      supplier: { findMany: jest.fn(), count: jest.fn() },
      debt: { aggregate: jest.fn(), groupBy: jest.fn() },
      payment: { aggregate: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };
    repository = new PrismaSupplierDebtRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('search', () => {
    it('trả về danh sách công nợ theo supplier, balance = totalDebt - totalPaid', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawSupplier], 1]);
      prisma.debt.groupBy.mockResolvedValue([
        {
          supplierId: 'supplier-1',
          _sum: { amount: new Prisma.Decimal(1000000) },
        },
      ]);
      prisma.payment.groupBy.mockResolvedValue([
        {
          supplierId: 'supplier-1',
          _sum: { amount: new Prisma.Decimal(400000) },
        },
      ]);

      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        supplierId: 'supplier-1',
        supplierCode: 'NCC001',
        supplierName: 'NCC A',
        totalDebt: '1000000',
        totalPaid: '400000',
        balance: '600000',
      });
    });

    it('trả về balance = 0 khi supplier chưa có Debt/Payment nào', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawSupplier], 1]);
      prisma.debt.groupBy.mockResolvedValue([]);
      prisma.payment.groupBy.mockResolvedValue([]);

      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });

      expect(result.items[0].totalDebt).toBe('0');
      expect(result.items[0].balance).toBe('0');
    });

    it('không gọi groupBy khi không có supplier nào khớp filter', async () => {
      prisma.$transaction.mockResolvedValueOnce([[], 0]);

      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });

      expect(result.items).toEqual([]);
      expect(prisma.debt.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('tính đúng balance = totalDebt - totalPaid', async () => {
      prisma.debt.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(1000000) },
      });
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal(300000) },
      });

      await expect(repository.getBalance('org-1', 'supplier-1')).resolves.toBe(
        '700000',
      );
    });
  });

  describe('createPayment', () => {
    const input = {
      organizationId: 'org-1',
      branchId: 'branch-1',
      supplierId: 'supplier-1',
      method: 'CASH' as const,
      amount: 500000,
      paidAt: new Date('2026-01-01'),
      createdBy: 'user-1',
    };

    function makeTx(overrides: {
      debtSum?: Prisma.Decimal | null;
      paymentSum?: Prisma.Decimal | null;
    }) {
      const tx = {
        debt: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { amount: overrides.debtSum ?? null } }),
        },
        payment: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { amount: overrides.paymentSum ?? null },
          }),
          create: jest.fn().mockResolvedValue(rawPayment),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(tx)),
      );
      return tx;
    }

    it('tạo payment thành công khi trong hạn mức công nợ', async () => {
      const tx = makeTx({ debtSum: new Prisma.Decimal(1000000) });

      const result = await repository.createPayment(input);
      expect(result.id).toBe('payment-1');
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          supplierId: 'supplier-1',
          direction: 'OUT',
          amount: 500000,
        }),
      });
    });

    it('ném SupplierPaymentExceedsBalanceError khi amount > balance hiện tại', async () => {
      makeTx({ debtSum: new Prisma.Decimal(100000) });

      await expect(repository.createPayment(input)).rejects.toThrow(
        SupplierPaymentExceedsBalanceError,
      );
    });

    it('ném lỗi khi balance = 0 (chưa từng có Debt nào)', async () => {
      const tx = makeTx({});

      await expect(repository.createPayment(input)).rejects.toThrow(
        SupplierPaymentExceedsBalanceError,
      );
      expect(tx.payment.create).not.toHaveBeenCalled();
    });
  });
});
