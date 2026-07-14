import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaSupplierProductRepository } from './prisma-supplier-product.repository';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('mock prisma error', {
    code,
    clientVersion: '6.19.3',
    meta,
  });
}

const rawMapping = {
  id: 'sp-1',
  supplierId: 'sup-1',
  productId: 'product-1',
  supplierSku: null,
  priority: 0,
  defaultPrice: null,
  leadTime: null,
  minimumOrderQuantity: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

describe('PrismaSupplierProductRepository', () => {
  let repository: PrismaSupplierProductRepository;
  let prisma: {
    supplierProduct: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      supplierProduct: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    repository = new PrismaSupplierProductRepository(
      prisma as unknown as PrismaService,
    );
  });

  describe('upsert', () => {
    const input = {
      supplierId: 'sup-1',
      productId: 'product-1',
      actorId: 'user-1',
    };

    it('tạo/cập nhật thành công', async () => {
      prisma.supplierProduct.upsert.mockResolvedValue(rawMapping);
      const result = await repository.upsert(input);
      expect(result.supplierId).toBe('sup-1');
      expect(prisma.supplierProduct.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            supplierId_productId: {
              supplierId: 'sup-1',
              productId: 'product-1',
            },
          },
        }),
      );
    });

    it('dịch lỗi P2002 sang ConflictException', async () => {
      prisma.supplierProduct.upsert.mockRejectedValue(knownError('P2002'));
      await expect(repository.upsert(input)).rejects.toThrow(ConflictException);
    });

    it('dịch lỗi P2003 sang BadRequestException', async () => {
      prisma.supplierProduct.upsert.mockRejectedValue(
        knownError('P2003', { field_name: 'productId' }),
      );
      await expect(repository.upsert(input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ném thẳng lỗi không xác định', async () => {
      prisma.supplierProduct.upsert.mockRejectedValue(new Error('boom'));
      await expect(repository.upsert(input)).rejects.toThrow('boom');
    });
  });

  describe('listBySupplier', () => {
    it('trả về danh sách sắp theo priority', async () => {
      prisma.supplierProduct.findMany.mockResolvedValue([rawMapping]);
      const result = await repository.listBySupplier('sup-1', 'org-1');
      expect(result).toHaveLength(1);
      expect(prisma.supplierProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            supplierId: 'sup-1',
            deletedAt: null,
            supplier: { organizationId: 'org-1', deletedAt: null },
          },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('trả về null khi không tìm thấy', async () => {
      prisma.supplierProduct.findFirst.mockResolvedValue(null);
      await expect(
        repository.findOne('sup-1', 'product-1', 'org-1'),
      ).resolves.toBeNull();
    });

    it('map đúng entity khi tìm thấy', async () => {
      prisma.supplierProduct.findFirst.mockResolvedValue(rawMapping);
      const result = await repository.findOne('sup-1', 'product-1', 'org-1');
      expect(result?.id).toBe('sp-1');
    });
  });

  describe('remove', () => {
    it('set deletedAt', async () => {
      prisma.supplierProduct.update.mockResolvedValue(rawMapping);
      await repository.remove('sup-1', 'product-1', 'user-1');
      expect(prisma.supplierProduct.update).toHaveBeenCalledWith({
        where: {
          supplierId_productId: { supplierId: 'sup-1', productId: 'product-1' },
        },
        data: expect.objectContaining({ updatedBy: 'user-1' }),
      });
    });
  });
});
