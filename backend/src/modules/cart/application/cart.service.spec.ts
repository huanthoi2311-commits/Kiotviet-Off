import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ProductEntity } from '../../product/domain/entities/product.entity';
import type { IProductRepository } from '../../product/domain/repositories/product.repository.interface';
import { CartEntity } from '../domain/entities/cart.entity';
import type { ICartRepository } from '../domain/repositories/cart.repository.interface';
import { ActorContext, CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<ICartRepository>;
  let productRepository: jest.Mocked<Pick<IProductRepository, 'findById'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const product: ProductEntity = {
    id: 'prod-1',
    organizationId: 'org-1',
    categoryId: 'cat-1',
    brandId: null,
    unitId: 'unit-1',
    parentProductId: null,
    sku: 'SKU001',
    slug: 'ao-thun',
    name: 'Áo thun',
    description: null,
    costPrice: '80000.00',
    vat: '10.00',
    weight: null,
    length: null,
    width: null,
    height: null,
    minStock: null,
    maxStock: null,
    type: 'STANDARD',
    allowSale: true,
    status: 'ACTIVE',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    prices: [{ id: 'price-1', type: 'RETAIL', price: '100000.00' }],
    images: [],
    barcodes: [],
  };

  beforeEach(() => {
    cartRepository = {
      findByUserId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    productRepository = {
      findById: jest.fn(),
    };
    service = new CartService(
      cartRepository,
      productRepository as unknown as IProductRepository,
    );
  });

  describe('getCart', () => {
    it('trả về giỏ rỗng khi user chưa có cart trong Redis', async () => {
      cartRepository.findByUserId.mockResolvedValue(null);
      const result = await service.getCart(actor);
      expect(result.items).toEqual([]);
      expect(result.totalAmount).toBe('0.00');
    });

    it('trả về cart có sẵn từ Redis', async () => {
      const cart: CartEntity = {
        organizationId: 'org-1',
        userId: 'user-1',
        items: [
          {
            productId: 'prod-1',
            productName: 'Áo thun',
            quantity: '2.000',
            price: '100000.00',
            discount: '0.00',
            promotion: '0.00',
            voucher: '0.00',
            tax: '20000.00',
            total: '220000.00',
          },
        ],
        subtotal: '200000.00',
        totalDiscount: '0.00',
        totalPromotion: '0.00',
        totalVoucher: '0.00',
        totalTax: '20000.00',
        totalAmount: '220000.00',
        updatedAt: '2026-07-15T00:00:00.000Z',
      };
      cartRepository.findByUserId.mockResolvedValue(cart);
      const result = await service.getCart(actor);
      expect(result.items).toHaveLength(1);
      expect(result.totalAmount).toBe('220000.00');
    });
  });

  describe('addItem', () => {
    it('ném NotFoundException khi sản phẩm không tồn tại', async () => {
      productRepository.findById.mockResolvedValue(null);
      await expect(
        service.addItem({ productId: 'prod-x', quantity: 1 }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(cartRepository.save).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException khi sản phẩm không được phép bán', async () => {
      productRepository.findById.mockResolvedValue({
        ...product,
        allowSale: false,
      });
      await expect(
        service.addItem({ productId: 'prod-1', quantity: 1 }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném UnprocessableEntityException khi sản phẩm chưa có giá RETAIL', async () => {
      productRepository.findById.mockResolvedValue({
        ...product,
        prices: [{ id: 'price-2', type: 'WHOLESALE', price: '90000.00' }],
      });
      await expect(
        service.addItem({ productId: 'prod-1', quantity: 1 }, actor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('thêm dòng mới vào giỏ rỗng, tính đúng price/tax/total theo Product', async () => {
      productRepository.findById.mockResolvedValue(product);
      cartRepository.findByUserId.mockResolvedValue(null);

      const result = await service.addItem(
        { productId: 'prod-1', quantity: 2 },
        actor,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe('2.000');
      expect(result.items[0].price).toBe('100000.00');
      expect(result.items[0].tax).toBe('20000.00');
      expect(result.items[0].total).toBe('220000.00');
      expect(result.totalAmount).toBe('220000.00');
      expect(cartRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
      );
    });

    it('cộng dồn quantity khi sản phẩm đã có sẵn trong giỏ (re-snapshot theo giá hiện tại)', async () => {
      productRepository.findById.mockResolvedValue(product);
      cartRepository.findByUserId.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-1',
        items: [
          {
            productId: 'prod-1',
            productName: 'Áo thun',
            quantity: '1.000',
            price: '100000.00',
            discount: '0.00',
            promotion: '0.00',
            voucher: '0.00',
            tax: '10000.00',
            total: '110000.00',
          },
        ],
        subtotal: '100000.00',
        totalDiscount: '0.00',
        totalPromotion: '0.00',
        totalVoucher: '0.00',
        totalTax: '10000.00',
        totalAmount: '110000.00',
        updatedAt: '2026-07-15T00:00:00.000Z',
      });

      const result = await service.addItem(
        { productId: 'prod-1', quantity: 3 },
        actor,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe('4.000');
      expect(result.items[0].total).toBe('440000.00');
    });
  });

  describe('updateItem', () => {
    const cartWithItem: CartEntity = {
      organizationId: 'org-1',
      userId: 'user-1',
      items: [
        {
          productId: 'prod-1',
          productName: 'Áo thun',
          quantity: '2.000',
          price: '100000.00',
          discount: '0.00',
          promotion: '0.00',
          voucher: '0.00',
          tax: '20000.00',
          total: '220000.00',
        },
      ],
      subtotal: '200000.00',
      totalDiscount: '0.00',
      totalPromotion: '0.00',
      totalVoucher: '0.00',
      totalTax: '20000.00',
      totalAmount: '220000.00',
      updatedAt: '2026-07-15T00:00:00.000Z',
    };

    it('ném NotFoundException khi giỏ hàng rỗng', async () => {
      cartRepository.findByUserId.mockResolvedValue(null);
      await expect(
        service.updateItem({ productId: 'prod-1', quantity: 5 }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném NotFoundException khi sản phẩm không có trong giỏ', async () => {
      cartRepository.findByUserId.mockResolvedValue(cartWithItem);
      await expect(
        service.updateItem({ productId: 'prod-x', quantity: 5 }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném NotFoundException khi Product đã bị xóa sau khi add vào giỏ', async () => {
      cartRepository.findByUserId.mockResolvedValue(cartWithItem);
      productRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateItem({ productId: 'prod-1', quantity: 5 }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('giữ nguyên price, cập nhật quantity/tax/total tuyệt đối', async () => {
      cartRepository.findByUserId.mockResolvedValue(cartWithItem);
      productRepository.findById.mockResolvedValue(product);

      const result = await service.updateItem(
        { productId: 'prod-1', quantity: 5 },
        actor,
      );

      expect(result.items[0].quantity).toBe('5.000');
      expect(result.items[0].price).toBe('100000.00');
      expect(result.items[0].tax).toBe('50000.00');
      expect(result.items[0].total).toBe('550000.00');
      expect(result.totalAmount).toBe('550000.00');
    });
  });

  describe('removeItem', () => {
    const cartWithItem: CartEntity = {
      organizationId: 'org-1',
      userId: 'user-1',
      items: [
        {
          productId: 'prod-1',
          productName: 'Áo thun',
          quantity: '2.000',
          price: '100000.00',
          discount: '0.00',
          promotion: '0.00',
          voucher: '0.00',
          tax: '20000.00',
          total: '220000.00',
        },
      ],
      subtotal: '200000.00',
      totalDiscount: '0.00',
      totalPromotion: '0.00',
      totalVoucher: '0.00',
      totalTax: '20000.00',
      totalAmount: '220000.00',
      updatedAt: '2026-07-15T00:00:00.000Z',
    };

    it('ném NotFoundException khi giỏ hàng rỗng', async () => {
      cartRepository.findByUserId.mockResolvedValue(null);
      await expect(
        service.removeItem({ productId: 'prod-1' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném NotFoundException khi sản phẩm không có trong giỏ', async () => {
      cartRepository.findByUserId.mockResolvedValue(cartWithItem);
      await expect(
        service.removeItem({ productId: 'prod-x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('xóa đúng dòng và tính lại tổng về 0', async () => {
      cartRepository.findByUserId.mockResolvedValue(cartWithItem);
      const result = await service.removeItem({ productId: 'prod-1' }, actor);
      expect(result.items).toEqual([]);
      expect(result.totalAmount).toBe('0.00');
      expect(cartRepository.save).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('xóa key Redis và trả về giỏ rỗng', async () => {
      const result = await service.clear(actor);
      expect(cartRepository.delete).toHaveBeenCalledWith('org-1', 'user-1');
      expect(result.items).toEqual([]);
      expect(result.totalAmount).toBe('0.00');
    });
  });
});
