import { PrismaService } from '../../../../prisma/prisma.service';
import { ProductPriceConcurrencyConflictError } from '../../domain/errors/product-price.errors';
import { PrismaProductPriceRepository } from './prisma-product-price.repository';

describe('PrismaProductPriceRepository', () => {
  let repository: PrismaProductPriceRepository;
  let prisma: {
    product: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const rawPrice = {
    id: 'price-1',
    type: 'RETAIL',
    price: { toString: () => '150000' },
  };

  beforeEach(() => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    repository = new PrismaProductPriceRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('findSetByProductId', () => {
    it('trả về null khi Product không tồn tại', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(
        repository.findSetByProductId('product-1'),
      ).resolves.toBeNull();
    });

    it('map đúng priceVersion + prices khi tìm thấy', async () => {
      prisma.product.findUnique.mockResolvedValue({
        priceVersion: 3,
        prices: [rawPrice],
      });
      const result = await repository.findSetByProductId('product-1');
      expect(result?.priceVersion).toBe(3);
      expect(result?.prices).toEqual([
        { id: 'price-1', type: 'RETAIL', price: '150000' },
      ]);
    });
  });

  describe('replaceSet', () => {
    it('compare-and-swap thành công: updateMany priceVersion, deleteMany + createMany trong 1 transaction', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const createMany = jest.fn().mockResolvedValue({ count: 1 });
      const findUniqueOrThrow = jest.fn().mockResolvedValue({
        priceVersion: 2,
        prices: [rawPrice],
      });
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(
          fn({
            product: { updateMany, findUniqueOrThrow },
            productPrice: { deleteMany, createMany },
          }),
        ),
      );

      const result = await repository.replaceSet(
        'product-1',
        1,
        [{ type: 'RETAIL', price: 150000 }],
        'user-1',
      );

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'product-1', priceVersion: 1 },
        data: { priceVersion: { increment: 1 } },
      });
      expect(deleteMany).toHaveBeenCalledWith({
        where: { productId: 'product-1' },
      });
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            productId: 'product-1',
            type: 'RETAIL',
            price: 150000,
            createdBy: 'user-1',
            updatedBy: 'user-1',
          },
        ],
      });
      expect(result.priceVersion).toBe(2);
    });

    it('ném ProductPriceConcurrencyConflictError khi priceVersion không khớp (0 dòng bị ảnh hưởng)', async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const deleteMany = jest.fn();
      const createMany = jest.fn();
      prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({
          product: { updateMany, findUniqueOrThrow: jest.fn() },
          productPrice: { deleteMany, createMany },
        }),
      );

      await expect(
        repository.replaceSet(
          'product-1',
          99,
          [{ type: 'RETAIL', price: 150000 }],
          'user-1',
        ),
      ).rejects.toThrow(ProductPriceConcurrencyConflictError);
      expect(deleteMany).not.toHaveBeenCalled();
      expect(createMany).not.toHaveBeenCalled();
    });
  });
});
