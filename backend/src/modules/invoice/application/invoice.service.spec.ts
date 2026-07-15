import { NotFoundException } from '@nestjs/common';
import type { IInvoiceCodeGenerator } from '../domain/services/invoice-code-generator.interface';
import type { IInvoiceRepository } from '../domain/repositories/invoice.repository.interface';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let invoiceRepository: jest.Mocked<IInvoiceRepository>;
  let invoiceCodeGenerator: jest.Mocked<IInvoiceCodeGenerator>;

  const rawInvoice = {
    id: 'inv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    orderId: null,
    customerId: 'cus-1',
    code: 'HD000001',
    status: 'PAID' as const,
    totalAmount: '220000.00',
    paidAmount: '220000.00',
    dueAmount: '0.00',
    dueDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    items: [
      {
        id: 'item-1',
        productId: 'prod-1',
        quantity: '2.000',
        unitPrice: '100000.00',
        discount: '0.00',
        taxAmount: '20000.00',
        totalAmount: '220000.00',
      },
    ],
  };

  beforeEach(() => {
    invoiceRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
    };
    invoiceCodeGenerator = { generate: jest.fn() };
    service = new InvoiceService(invoiceRepository, invoiceCodeGenerator);
  });

  describe('createInvoice', () => {
    it('sinh code trước rồi mới gọi repository.create, truyền tx nếu có', async () => {
      invoiceCodeGenerator.generate.mockResolvedValue('HD000001');
      invoiceRepository.create.mockResolvedValue(rawInvoice);
      const tx = {} as never;

      const result = await service.createInvoice(
        {
          organizationId: 'org-1',
          branchId: 'branch-1',
          customerId: 'cus-1',
          totalAmount: 220000,
          paidAmount: 220000,
          dueAmount: 0,
          status: 'PAID',
          items: [],
          createdBy: 'user-1',
        },
        tx,
      );

      expect(invoiceCodeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(invoiceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'HD000001' }),
        tx,
      );
      expect(result.code).toBe('HD000001');
    });
  });

  describe('getById', () => {
    it('ném NotFoundException khi không tìm thấy', async () => {
      invoiceRepository.findById.mockResolvedValue(null);
      await expect(service.getById('inv-x', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về DTO khi tìm thấy', async () => {
      invoiceRepository.findById.mockResolvedValue(rawInvoice);
      const result = await service.getById('inv-1', 'org-1');
      expect(result.code).toBe('HD000001');
    });
  });

  describe('search', () => {
    it('áp dụng page/limit mặc định', async () => {
      invoiceRepository.search.mockResolvedValue({
        items: [rawInvoice],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({}, 'org-1');
      expect(invoiceRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          page: 1,
          limit: 20,
        }),
      );
      expect(result.total).toBe(1);
    });
  });
});
