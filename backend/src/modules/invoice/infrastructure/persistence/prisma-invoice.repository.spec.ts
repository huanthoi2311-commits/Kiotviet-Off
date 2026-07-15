import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaInvoiceRepository } from './prisma-invoice.repository';

describe('PrismaInvoiceRepository', () => {
  let repository: PrismaInvoiceRepository;
  let prisma: {
    invoice: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawItem = {
    id: 'item-1',
    productId: 'prod-1',
    quantity: { toString: () => '2.000' },
    unitPrice: { toString: () => '100000.00' },
    discount: { toString: () => '0.00' },
    taxAmount: { toString: () => '20000.00' },
    totalAmount: { toString: () => '220000.00' },
  };

  const rawInvoice = {
    id: 'inv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    orderId: null,
    customerId: 'cus-1',
    code: 'HD000001',
    status: 'PAID',
    totalAmount: { toString: () => '220000.00' },
    paidAmount: { toString: () => '220000.00' },
    dueAmount: { toString: () => '0.00' },
    dueDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    items: [rawItem],
  };

  beforeEach(() => {
    prisma = {
      invoice: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaInvoiceRepository(
      prisma as unknown as PrismaService,
    );
  });

  const input = {
    organizationId: 'org-1',
    branchId: 'branch-1',
    customerId: 'cus-1',
    code: 'HD000001',
    status: 'PAID' as const,
    totalAmount: 220000,
    paidAmount: 220000,
    dueAmount: 0,
    items: [
      {
        productId: 'prod-1',
        quantity: 2,
        unitPrice: 100000,
        taxAmount: 20000,
        totalAmount: 220000,
      },
    ],
    createdBy: 'user-1',
  };

  describe('create', () => {
    it('tạo Invoice kèm items lồng nhau qua this.prisma khi không truyền tx', async () => {
      prisma.invoice.create.mockResolvedValue(rawInvoice);
      const result = await repository.create(input);

      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: 'HD000001',
            items: {
              create: [
                expect.objectContaining({
                  productId: 'prod-1',
                  quantity: 2,
                }),
              ],
            },
          }),
        }),
      );
      expect(result.id).toBe('inv-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].totalAmount).toBe('220000.00');
    });

    it('dùng thẳng tx được truyền vào, không dùng this.prisma', async () => {
      const tx = {
        invoice: { create: jest.fn().mockResolvedValue(rawInvoice) },
      };
      await repository.create(input, tx as never);

      expect(prisma.invoice.create).not.toHaveBeenCalled();
      expect(tx.invoice.create).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      const result = await repository.findById('inv-x', 'org-1');
      expect(result).toBeNull();
    });

    it('trả về entity kèm items khi tìm thấy', async () => {
      prisma.invoice.findFirst.mockResolvedValue(rawInvoice);
      const result = await repository.findById('inv-1', 'org-1');
      expect(result?.code).toBe('HD000001');
      expect(result?.items).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang', async () => {
      prisma.$transaction.mockResolvedValueOnce([[rawInvoice], 1]);
      const result = await repository.search({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].code).toBe('HD000001');
    });
  });
});
