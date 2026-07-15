import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaPaymentRepository } from './prisma-payment.repository';

describe('PrismaPaymentRepository', () => {
  let repository: PrismaPaymentRepository;
  let prisma: {
    payment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const rawPayment = {
    id: 'pay-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'invoice-1',
    customerId: 'cus-1',
    method: 'CASH',
    direction: 'IN',
    amount: { toString: () => '150000' },
    paidAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      payment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    repository = new PrismaPaymentRepository(
      prisma as unknown as PrismaService,
    );
  });

  const input = {
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'invoice-1',
    customerId: 'cus-1',
    method: 'CASH' as const,
    amount: 150000,
    paidAt: new Date('2026-01-01'),
    createdBy: 'user-1',
  };

  describe('create', () => {
    it('ghi Payment direction IN qua this.prisma khi không truyền tx', async () => {
      prisma.payment.create.mockResolvedValue(rawPayment);
      const result = await repository.create(input);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          direction: 'IN',
          invoiceId: 'invoice-1',
          method: 'CASH',
        }),
      });
      expect(result.id).toBe('pay-1');
      expect(result.amount).toBe('150000');
    });

    it('dùng thẳng tx được truyền vào (Checkout Engine), không dùng this.prisma', async () => {
      const tx = {
        payment: { create: jest.fn().mockResolvedValue(rawPayment) },
      };
      await repository.create(input, tx as never);

      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(tx.payment.create).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      const result = await repository.findById('pay-x', 'org-1');
      expect(result).toBeNull();
    });

    it('trả về entity khi tìm thấy, chỉ lọc direction IN', async () => {
      prisma.payment.findFirst.mockResolvedValue(rawPayment);
      const result = await repository.findById('pay-1', 'org-1');
      expect(result?.id).toBe('pay-1');
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ direction: 'IN' }),
        }),
      );
    });
  });

  describe('findByInvoiceId', () => {
    it('trả về danh sách payment của 1 invoice, mới nhất trước', async () => {
      prisma.payment.findMany.mockResolvedValue([rawPayment]);
      const result = await repository.findByInvoiceId('invoice-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            invoiceId: 'invoice-1',
            organizationId: 'org-1',
            direction: 'IN',
          },
          orderBy: { paidAt: 'desc' },
        }),
      );
    });
  });
});
