import { Prisma } from '@prisma/client';
import {
  SalesReturnInvoiceItemNotFoundError,
  SalesReturnQtyExceededError,
} from '../domain/errors/sales-return.errors';
import { ReturnEligibilityService } from './return-eligibility.service';

const D = (v: string | number) => new Prisma.Decimal(v);

describe('ReturnEligibilityService', () => {
  let service: ReturnEligibilityService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      invoiceItem: { findFirst: jest.fn() },
      salesReturnItem: { aggregate: jest.fn() },
    };
    service = new ReturnEligibilityService(prisma);
  });

  describe('getEligibleQuantity', () => {
    it('tính đúng eligibleQty = soldQty - returnedQty', async () => {
      prisma.invoiceItem.findFirst.mockResolvedValue({ quantity: D('10.000') });
      prisma.salesReturnItem.aggregate.mockResolvedValue({
        _sum: { quantity: D('3.000') },
      });
      const result = await service.getEligibleQuantity('invitem-1', 'org-1');
      expect(result.soldQty).toBe('10');
      expect(result.returnedQty).toBe('3');
      expect(result.eligibleQty).toBe('7');
    });

    it('returnedQty = 0 khi chưa có Return nào RECEIVED/COMPLETED', async () => {
      prisma.invoiceItem.findFirst.mockResolvedValue({ quantity: D('10.000') });
      prisma.salesReturnItem.aggregate.mockResolvedValue({
        _sum: { quantity: null },
      });
      const result = await service.getEligibleQuantity('invitem-1', 'org-1');
      expect(result.eligibleQty).toBe('10');
    });

    it('ném SalesReturnInvoiceItemNotFoundError khi không tìm thấy InvoiceItem', async () => {
      prisma.invoiceItem.findFirst.mockResolvedValue(null);
      await expect(
        service.getEligibleQuantity('invitem-x', 'org-1'),
      ).rejects.toThrow(SalesReturnInvoiceItemNotFoundError);
    });
  });

  describe('validateRequestedQuantities', () => {
    it('không ném lỗi khi requestedQty <= eligibleQty', async () => {
      prisma.invoiceItem.findFirst.mockResolvedValue({ quantity: D('10.000') });
      prisma.salesReturnItem.aggregate.mockResolvedValue({
        _sum: { quantity: D('2.000') },
      });
      await expect(
        service.validateRequestedQuantities(
          [{ invoiceItemId: 'invitem-1', quantity: 5 }],
          'org-1',
        ),
      ).resolves.toBeUndefined();
    });

    it('ném SalesReturnQtyExceededError khi vượt eligibleQty', async () => {
      prisma.invoiceItem.findFirst.mockResolvedValue({ quantity: D('10.000') });
      prisma.salesReturnItem.aggregate.mockResolvedValue({
        _sum: { quantity: D('8.000') },
      });
      await expect(
        service.validateRequestedQuantities(
          [{ invoiceItemId: 'invitem-1', quantity: 5 }],
          'org-1',
        ),
      ).rejects.toThrow(SalesReturnQtyExceededError);
    });

    it('gộp nhiều dòng cùng invoiceItemId trước khi so sánh', async () => {
      prisma.invoiceItem.findFirst.mockResolvedValue({ quantity: D('10.000') });
      prisma.salesReturnItem.aggregate.mockResolvedValue({
        _sum: { quantity: null },
      });
      // 6 + 5 = 11 > 10 -> phải ném lỗi dù mỗi dòng riêng lẻ đều hợp lệ
      await expect(
        service.validateRequestedQuantities(
          [
            { invoiceItemId: 'invitem-1', quantity: 6 },
            { invoiceItemId: 'invitem-1', quantity: 5 },
          ],
          'org-1',
        ),
      ).rejects.toThrow(SalesReturnQtyExceededError);
    });
  });
});
