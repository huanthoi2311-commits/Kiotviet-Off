import { NotFoundException } from '@nestjs/common';
import type { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: jest.Mocked<IPaymentRepository>;

  const rawPayment = {
    id: 'pay-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    invoiceId: 'invoice-1',
    customerId: 'cus-1',
    method: 'CASH' as const,
    amount: '150000',
    paidAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    paymentRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByInvoiceId: jest.fn(),
    };
    service = new PaymentService(paymentRepository);
  });

  describe('createPayment', () => {
    it('ủy quyền cho repository, truyền tx nếu có', async () => {
      paymentRepository.create.mockResolvedValue(rawPayment);
      const tx = {} as never;
      const result = await service.createPayment(
        {
          organizationId: 'org-1',
          branchId: 'branch-1',
          invoiceId: 'invoice-1',
          method: 'CASH',
          amount: 150000,
          paidAt: new Date('2026-01-01'),
          createdBy: 'user-1',
        },
        tx,
      );
      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'invoice-1' }),
        tx,
      );
      expect(result.id).toBe('pay-1');
    });
  });

  describe('getById', () => {
    it('ném NotFoundException khi không tìm thấy', async () => {
      paymentRepository.findById.mockResolvedValue(null);
      await expect(service.getById('pay-x', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về DTO khi tìm thấy', async () => {
      paymentRepository.findById.mockResolvedValue(rawPayment);
      const result = await service.getById('pay-1', 'org-1');
      expect(result.id).toBe('pay-1');
    });
  });

  describe('getByInvoiceId', () => {
    it('trả về danh sách DTO', async () => {
      paymentRepository.findByInvoiceId.mockResolvedValue([rawPayment]);
      const result = await service.getByInvoiceId('invoice-1', 'org-1');
      expect(result).toHaveLength(1);
    });
  });
});
