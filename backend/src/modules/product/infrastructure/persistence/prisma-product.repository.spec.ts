import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaProductRepository } from './prisma-product.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

describe('PrismaProductRepository', () => {
  let repository: PrismaProductRepository;
  let prisma: {
    product: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    productPrice: { findMany: jest.Mock };
    barcode: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  const rawProduct = {
    id: 'product-1',
    organizationId: 'org-1',
    categoryId: 'category-1',
    brandId: 'brand-1',
    unitId: 'unit-1',
    sku: 'SP000001',
    slug: 'ao-thun-nam',
    name: 'Áo thun nam',
    description: null,
    costPrice: { toString: () => '90000' },
    vat: { toString: () => '8' },
    weight: null,
    length: null,
    width: null,
    height: null,
    minStock: null,
    maxStock: null,
    isService: false,
    allowSale: true,
    status: 'ACTIVE',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    prices: [
      { id: 'price-1', type: 'RETAIL', price: { toString: () => '150000' } },
    ],
    images: [],
    barcodes: [],
  };

  beforeEach(() => {
    prisma = {
      product: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      productPrice: { findMany: jest.fn() },
      barcode: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    repository = new PrismaProductRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('create', () => {
    const input = {
      organizationId: 'org-1',
      categoryId: 'category-1',
      unitId: 'unit-1',
      sku: 'SP000001',
      slug: 'ao-thun-nam',
      name: 'Áo thun nam',
      costPrice: 90000,
      prices: [{ type: 'RETAIL' as const, price: 150000 }],
      createdBy: 'user-1',
    };

    it('tạo product kèm prices/images/barcodes trong 1 lệnh Prisma nested (atomic)', async () => {
      prisma.product.create.mockResolvedValue(rawProduct);

      const result = await repository.create(input);

      expect(prisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prices: { createMany: { data: input.prices } },
          }),
        }),
      );
      expect(result.sku).toBe('SP000001');
      expect(result.costPrice).toBe('90000');
    });

    it('dịch lỗi P2002 (trùng SKU/slug/barcode) sang ConflictException', async () => {
      prisma.product.create.mockRejectedValue(
        knownError('P2002', { target: ['sku'] }),
      );

      await expect(repository.create(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 (categoryId không tồn tại) sang BadRequestException', async () => {
      prisma.product.create.mockRejectedValue(
        knownError('P2003', { field_name: 'products_categoryId_fkey' }),
      );

      await expect(repository.create(input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ném thẳng lỗi không xác định (không phải Prisma known error)', async () => {
      prisma.product.create.mockRejectedValue(new Error('boom'));
      await expect(repository.create(input)).rejects.toThrow('boom');
    });

    it('tạo kèm images/barcodes, tự gán sortOrder/isThumbnail/isDefault mặc định theo vị trí đầu tiên', async () => {
      prisma.product.create.mockResolvedValue(rawProduct);

      await repository.create({
        ...input,
        images: [{ url: 'https://cdn/a.jpg' }, { url: 'https://cdn/b.jpg' }],
        barcodes: [
          { code: '111', type: 'EAN13' },
          { code: '222', type: 'QR' },
        ],
      });

      const callArg = prisma.product.create.mock.calls[0][0];
      expect(callArg.data.images.createMany.data[0]).toMatchObject({
        url: 'https://cdn/a.jpg',
        sortOrder: 0,
        isThumbnail: true,
      });
      expect(callArg.data.images.createMany.data[1]).toMatchObject({
        sortOrder: 1,
        isThumbnail: false,
      });
      expect(callArg.data.barcodes.createMany.data[0]).toMatchObject({
        code: '111',
        isDefault: true,
      });
      expect(callArg.data.barcodes.createMany.data[1]).toMatchObject({
        code: '222',
        isDefault: false,
      });
    });
  });

  describe('findById', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(repository.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('map Decimal sang string khi tìm thấy', async () => {
      prisma.product.findFirst.mockResolvedValue(rawProduct);
      const result = await repository.findById('product-1', 'org-1');
      expect(result?.vat).toBe('8');
      expect(result?.prices[0].price).toBe('150000');
    });

    it('map đầy đủ kích thước và barcodes khi có dữ liệu (không null)', async () => {
      prisma.product.findFirst.mockResolvedValue({
        ...rawProduct,
        weight: { toString: () => '0.5' },
        length: { toString: () => '30' },
        width: { toString: () => '20' },
        height: { toString: () => '2' },
        barcodes: [
          { id: 'barcode-1', code: '111', type: 'EAN13', isDefault: true },
        ],
        images: [
          {
            id: 'image-1',
            url: 'https://cdn/a.jpg',
            sortOrder: 0,
            isThumbnail: true,
          },
        ],
      });

      const result = await repository.findById('product-1', 'org-1');

      expect(result?.weight).toBe('0.5');
      expect(result?.barcodes).toEqual([
        { id: 'barcode-1', code: '111', type: 'EAN13', isDefault: true },
      ]);
      expect(result?.images).toEqual([
        {
          id: 'image-1',
          url: 'https://cdn/a.jpg',
          sortOrder: 0,
          isThumbnail: true,
        },
      ]);
    });
  });

  describe('findByIdIncludingDeleted', () => {
    it('trả về sản phẩm đã xóa mềm (deletedAt khác null)', async () => {
      prisma.product.findFirst.mockResolvedValue({
        ...rawProduct,
        deletedAt: new Date(),
      });
      const result = await repository.findByIdIncludingDeleted(
        'product-1',
        'org-1',
      );
      expect(result?.deletedAt).not.toBeNull();
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'product-1', organizationId: 'org-1' },
        }),
      );
    });

    it('trả về null khi không tìm thấy', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        repository.findByIdIncludingDeleted('missing', 'org-1'),
      ).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('cập nhật và dịch lỗi P2002 khi trùng dữ liệu', async () => {
      prisma.product.update.mockRejectedValue(
        knownError('P2002', { target: ['slug'] }),
      );
      await expect(
        repository.update('product-1', { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('cập nhật thành công trả về entity đã map', async () => {
      prisma.product.update.mockResolvedValue(rawProduct);
      const result = await repository.update('product-1', {
        name: 'x',
        updatedBy: 'user-1',
      });
      expect(result.id).toBe('product-1');
    });

    it('ném thẳng lỗi không xác định khi update thất bại vì lý do khác', async () => {
      prisma.product.update.mockRejectedValue(new Error('db down'));
      await expect(
        repository.update('product-1', { name: 'x', updatedBy: 'user-1' }),
      ).rejects.toThrow('db down');
    });
  });

  describe('softDelete / restore', () => {
    it('softDelete set deletedAt', async () => {
      prisma.product.update.mockResolvedValue(rawProduct);
      await repository.softDelete('product-1', 'user-1');
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ updatedBy: 'user-1' }),
        }),
      );
    });

    it('restore clear deletedAt', async () => {
      prisma.product.update.mockResolvedValue(rawProduct);
      await repository.restore('product-1', 'user-1');
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: null, updatedBy: 'user-1' },
        }),
      );
    });
  });

  describe('search', () => {
    const baseParams = {
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    it('sắp xếp theo field thường (name/sku/createdAt/updatedAt) qua $transaction', async () => {
      prisma.$transaction.mockResolvedValue([[rawProduct], 1]);

      const result = await repository.search(baseParams);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('sắp xếp theo price qua bảng ProductPrice (không SQL raw)', async () => {
      prisma.product.count.mockResolvedValue(1);
      prisma.productPrice.findMany.mockResolvedValue([
        { productId: 'product-1' },
      ]);
      prisma.product.findMany.mockResolvedValue([rawProduct]);

      const result = await repository.search({
        ...baseParams,
        sortBy: 'price',
      });

      expect(prisma.productPrice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'RETAIL' }),
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('trả về rỗng khi sort theo price nhưng không có ProductPrice nào khớp', async () => {
      prisma.product.count.mockResolvedValue(0);
      prisma.productPrice.findMany.mockResolvedValue([]);

      const result = await repository.search({
        ...baseParams,
        sortBy: 'price',
      });

      expect(result.items).toEqual([]);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('existsBySku / existsBySlug / existsByBarcode / hasActiveProductsInCategory', () => {
    it('existsBySku trả về true khi tìm thấy', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'product-1' });
      await expect(repository.existsBySku('org-1', 'SP000001')).resolves.toBe(
        true,
      );
    });

    it('existsBySlug trả về false khi không tìm thấy', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(repository.existsBySlug('org-1', 'ao-thun')).resolves.toBe(
        false,
      );
    });

    it('existsByBarcode kiểm tra trong phạm vi Organization', async () => {
      prisma.barcode.findFirst.mockResolvedValue({ id: 'barcode-1' });
      const result = await repository.existsByBarcode('org-1', '8938505970017');
      expect(result).toBe(true);
      expect(prisma.barcode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            code: '8938505970017',
            product: { organizationId: 'org-1' },
          },
        }),
      );
    });

    it('hasActiveProductsInCategory trả về true khi còn sản phẩm chưa xóa', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'product-1' });
      await expect(
        repository.hasActiveProductsInCategory('category-1'),
      ).resolves.toBe(true);
    });

    it('hasActiveProductsInBrand trả về false khi không còn sản phẩm', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        repository.hasActiveProductsInBrand('brand-1'),
      ).resolves.toBe(false);
    });

    it('hasActiveProductsInUnit trả về true khi còn sản phẩm chưa xóa', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'product-1' });
      await expect(repository.hasActiveProductsInUnit('unit-1')).resolves.toBe(
        true,
      );
    });
  });
});
