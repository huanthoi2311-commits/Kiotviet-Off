import { Prisma } from '@prisma/client';
import {
  buildCartItem,
  emptyCart,
  recalculateCartItem,
  recalculateCartTotals,
} from './cart.entity';

describe('cart.entity', () => {
  describe('emptyCart', () => {
    it('trả về giỏ hàng rỗng với tổng = 0.00', () => {
      const cart = emptyCart('org-1', 'user-1');
      expect(cart.items).toEqual([]);
      expect(cart.subtotal).toBe('0.00');
      expect(cart.totalAmount).toBe('0.00');
      expect(cart.organizationId).toBe('org-1');
      expect(cart.userId).toBe('user-1');
    });
  });

  describe('buildCartItem', () => {
    it('tính tax theo vat% và total = subtotal dòng + tax, discount/promotion/voucher = 0', () => {
      const item = buildCartItem({
        productId: 'prod-1',
        productName: 'Áo thun',
        quantity: new Prisma.Decimal(2),
        price: new Prisma.Decimal(100000),
        vatPercent: new Prisma.Decimal(10),
      });
      // lineSubtotal = 200000, tax = 20000, total = 220000
      expect(item.quantity).toBe('2.000');
      expect(item.price).toBe('100000.00');
      expect(item.tax).toBe('20000.00');
      expect(item.total).toBe('220000.00');
      expect(item.discount).toBe('0.00');
      expect(item.promotion).toBe('0.00');
      expect(item.voucher).toBe('0.00');
    });

    it('không sai số với vat 0%', () => {
      const item = buildCartItem({
        productId: 'prod-2',
        productName: 'Dịch vụ',
        quantity: new Prisma.Decimal(1),
        price: new Prisma.Decimal(50000),
        vatPercent: new Prisma.Decimal(0),
      });
      expect(item.tax).toBe('0.00');
      expect(item.total).toBe('50000.00');
    });

    it('hỗ trợ số lượng thập phân (hàng cân/khối lượng)', () => {
      const item = buildCartItem({
        productId: 'prod-3',
        productName: 'Thịt bò',
        quantity: new Prisma.Decimal(1.5),
        price: new Prisma.Decimal(200000),
        vatPercent: new Prisma.Decimal(0),
      });
      expect(item.quantity).toBe('1.500');
      expect(item.total).toBe('300000.00');
    });
  });

  describe('recalculateCartItem', () => {
    it('giữ nguyên price, tính lại tax/total theo quantity mới', () => {
      const original = buildCartItem({
        productId: 'prod-1',
        productName: 'Áo thun',
        quantity: new Prisma.Decimal(2),
        price: new Prisma.Decimal(100000),
        vatPercent: new Prisma.Decimal(10),
      });
      const updated = recalculateCartItem(
        original,
        new Prisma.Decimal(5),
        new Prisma.Decimal(10),
      );
      expect(updated.price).toBe('100000.00');
      expect(updated.quantity).toBe('5.000');
      expect(updated.tax).toBe('50000.00');
      expect(updated.total).toBe('550000.00');
    });
  });

  describe('recalculateCartTotals', () => {
    it('cộng đúng subtotal/discount/promotion/voucher/tax/totalAmount từ nhiều dòng', () => {
      const item1 = buildCartItem({
        productId: 'prod-1',
        productName: 'A',
        quantity: new Prisma.Decimal(2),
        price: new Prisma.Decimal(100000),
        vatPercent: new Prisma.Decimal(10),
      });
      const item2 = buildCartItem({
        productId: 'prod-2',
        productName: 'B',
        quantity: new Prisma.Decimal(1),
        price: new Prisma.Decimal(50000),
        vatPercent: new Prisma.Decimal(0),
      });
      const cart = recalculateCartTotals({
        organizationId: 'org-1',
        userId: 'user-1',
        items: [item1, item2],
        subtotal: '0.00',
        totalDiscount: '0.00',
        totalPromotion: '0.00',
        totalVoucher: '0.00',
        totalTax: '0.00',
        totalAmount: '0.00',
        updatedAt: new Date(0).toISOString(),
      });
      // subtotal = 200000 + 50000 = 250000, tax = 20000 + 0 = 20000
      expect(cart.subtotal).toBe('250000.00');
      expect(cart.totalDiscount).toBe('0.00');
      expect(cart.totalPromotion).toBe('0.00');
      expect(cart.totalVoucher).toBe('0.00');
      expect(cart.totalTax).toBe('20000.00');
      expect(cart.totalAmount).toBe('270000.00');
      expect(cart.updatedAt).not.toBe(new Date(0).toISOString());
    });

    it('trả về 0.00 cho giỏ hàng không có dòng nào', () => {
      const cart = recalculateCartTotals(emptyCart('org-1', 'user-1'));
      expect(cart.subtotal).toBe('0.00');
      expect(cart.totalAmount).toBe('0.00');
    });
  });
});
