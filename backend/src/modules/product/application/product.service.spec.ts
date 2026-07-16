import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductEntity } from '../domain/entities/product.entity';
import { ProductConcurrencyConflictError } from '../domain/errors/product.errors';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { ISkuGenerator } from '../domain/services/sku-generator.interface';
import { ISlugGenerator } from '../domain/services/slug-generator.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ActorContext, ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<IProductRepository>;
  let skuGenerator: jest.Mocked<ISkuGenerator>;
  let slugGenerator: jest.Mocked<ISlugGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    ip: '127.0.0.1',
    userAgent: 'jest',
  };

  const baseProduct: ProductEntity = {
    id: 'product-1',
    organizationId: 'org-1',
    categoryId: 'category-1',
    brandId: 'brand-1',
    unitId: 'unit-1',
    parentProductId: null,
    sku: 'SP000001',
    slug: 'ao-thun-nam',
    name: 'Áo thun nam',
    description: null,
    costPrice: '90000',
    vat: '8',
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    prices: [{ id: 'price-1', type: 'RETAIL', price: '150000' }],
    images: [],
    barcodes: [],
  };

  const createDto: CreateProductDto = {
    categoryId: 'category-1',
    brandId: 'brand-1',
    unitId: 'unit-1',
    type: 'STANDARD',
    name: 'Áo thun nam',
    costPrice: 90000,
    prices: [{ type: 'RETAIL', price: 150000 }],
  };

  const updateDto = (
    overrides: Partial<UpdateProductDto> = {},
  ): UpdateProductDto => ({
    version: baseProduct.version,
    ...overrides,
  });

  const originalFlag = process.env.PRODUCT_REFACTOR_ENABLED;

  beforeEach(() => {
    delete process.env.PRODUCT_REFACTOR_ENABLED;

    productRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      existsBySku: jest.fn(),
      existsBySlug: jest.fn(),
      existsByBarcode: jest.fn(),
      hasActiveProductsInCategory: jest.fn(),
      hasActiveProductsInBrand: jest.fn(),
      hasActiveProductsInUnit: jest.fn(),
      findChildrenByParentId: jest.fn(),
      hasActiveVariantChildren: jest.fn(),
      hasTransactionHistory: jest.fn(),
    };
    skuGenerator = { generate: jest.fn().mockResolvedValue('SP000001') };
    slugGenerator = {
      generateUnique: jest.fn().mockResolvedValue('ao-thun-nam'),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ProductService(
      productRepository,
      skuGenerator,
      slugGenerator,
      auditLogService as unknown as AuditLogService,
    );
  });

  afterAll(() => {
    if (originalFlag === undefined) {
      delete process.env.PRODUCT_REFACTOR_ENABLED;
    } else {
      process.env.PRODUCT_REFACTOR_ENABLED = originalFlag;
    }
  });

  describe('create', () => {
    it('sinh SKU/slug tự động, tạo sản phẩm và ghi audit log', async () => {
      productRepository.create.mockResolvedValue(baseProduct);

      const result = await service.create(createDto, actor);

      expect(skuGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(slugGenerator.generateUnique).toHaveBeenCalledWith(
        'org-1',
        'Áo thun nam',
      );
      expect(productRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'SP000001',
          slug: 'ao-thun-nam',
          organizationId: 'org-1',
          type: 'STANDARD',
        }),
      );
      expect(result.sku).toBe('SP000001');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product.create',
          entityId: 'product-1',
        }),
      );
    });

    it('ném UnprocessableEntityException khi không có giá RETAIL', async () => {
      const dtoWithoutRetail: CreateProductDto = {
        ...createDto,
        prices: [{ type: 'WHOLESALE', price: 120000 }],
      };

      await expect(service.create(dtoWithoutRetail, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.create).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException khi type=VARIANT_CHILD thiếu parentProductId', async () => {
      const dto: CreateProductDto = { ...createDto, type: 'VARIANT_CHILD' };

      await expect(service.create(dto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.create).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException khi parentProductId không trỏ tới VARIANT_PARENT', async () => {
      const dto: CreateProductDto = {
        ...createDto,
        type: 'VARIANT_CHILD',
        parentProductId: 'parent-1',
      };
      productRepository.findById.mockResolvedValue({
        ...baseProduct,
        id: 'parent-1',
        type: 'STANDARD',
      });

      await expect(service.create(dto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.create).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException khi parentProductId đặt cho type khác VARIANT_CHILD', async () => {
      const dto: CreateProductDto = {
        ...createDto,
        type: 'STANDARD',
        parentProductId: 'parent-1',
      };

      await expect(service.create(dto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.create).not.toHaveBeenCalled();
    });

    it('tạo thành công Variant Child khi parentProductId trỏ đúng VARIANT_PARENT (cùng categoryId)', async () => {
      const dto: CreateProductDto = {
        ...createDto,
        type: 'VARIANT_CHILD',
        parentProductId: 'parent-1',
      };
      productRepository.findById.mockResolvedValue({
        ...baseProduct,
        id: 'parent-1',
        type: 'VARIANT_PARENT',
        categoryId: 'category-1',
      });
      productRepository.create.mockResolvedValue({
        ...baseProduct,
        type: 'VARIANT_CHILD',
        parentProductId: 'parent-1',
      });

      const result = await service.create(dto, actor);

      expect(result.parentProductId).toBe('parent-1');
    });

    it('Variant khác Category (Decision Q8/S03, SPEC-CATEGORY-001 §5): ném UnprocessableEntityException khi Variant Child khác categoryId với Variant Parent', async () => {
      const dto: CreateProductDto = {
        ...createDto,
        categoryId: 'category-1',
        type: 'VARIANT_CHILD',
        parentProductId: 'parent-1',
      };
      productRepository.findById.mockResolvedValue({
        ...baseProduct,
        id: 'parent-1',
        type: 'VARIANT_PARENT',
        categoryId: 'category-2',
      });

      await expect(service.create(dto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('trả về sản phẩm khi tồn tại', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);
      const result = await service.findOne('product-1', 'org-1');
      expect(result.id).toBe('product-1');
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      productRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('map query DTO sang search params và trả về kết quả phân trang', async () => {
      productRepository.search.mockResolvedValue({
        items: [baseProduct],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await service.search(
        {
          search: 'áo',
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        'org-1',
      );

      expect(productRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'áo',
          page: 1,
          limit: 20,
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('áp dụng giá trị mặc định khi query rỗng', async () => {
      productRepository.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await service.search({}, 'org-1');

      expect(productRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      );
    });

    it('truyền type/unitId/parentProductId vào search params (Decision A07)', async () => {
      productRepository.search.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await service.search(
        { type: 'SERVICE', unitId: 'unit-1', parentProductId: 'parent-1' },
        'org-1',
      );

      expect(productRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SERVICE',
          unitId: 'unit-1',
          parentProductId: 'parent-1',
        }),
      );
    });
  });

  describe('update', () => {
    it('cập nhật sản phẩm, sinh lại slug khi tên đổi, ghi audit log old/new', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);
      slugGenerator.generateUnique.mockResolvedValue('ao-thun-nam-moi');
      productRepository.update.mockResolvedValue({
        ...baseProduct,
        name: 'Áo thun nam mới',
        slug: 'ao-thun-nam-moi',
      });

      const result = await service.update(
        'product-1',
        updateDto({ name: 'Áo thun nam mới' }),
        actor,
      );

      expect(slugGenerator.generateUnique).toHaveBeenCalledWith(
        'org-1',
        'Áo thun nam mới',
        'product-1',
      );
      expect(productRepository.update).toHaveBeenCalledWith(
        'product-1',
        baseProduct.version,
        expect.objectContaining({
          name: 'Áo thun nam mới',
          slug: 'ao-thun-nam-moi',
        }),
      );
      expect(result.slug).toBe('ao-thun-nam-moi');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product.update',
          oldValue: expect.any(Object),
        }),
      );
    });

    it('không sinh lại slug nếu tên không đổi', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.update.mockResolvedValue(baseProduct);

      await service.update('product-1', updateDto({ costPrice: 95000 }), actor);

      expect(slugGenerator.generateUnique).not.toHaveBeenCalled();
      expect(productRepository.update).toHaveBeenCalledWith(
        'product-1',
        baseProduct.version,
        expect.objectContaining({ slug: undefined }),
      );
    });

    it('ném NotFoundException khi sản phẩm không tồn tại', async () => {
      productRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', updateDto({ name: 'x' }), actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('Feature Flag TẮT (mặc định): đổi type dù đã có giao dịch vẫn được phép, không gọi hasTransactionHistory', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.update.mockResolvedValue({
        ...baseProduct,
        type: 'SERVICE',
      });

      await service.update('product-1', updateDto({ type: 'SERVICE' }), actor);

      expect(productRepository.hasTransactionHistory).not.toHaveBeenCalled();
      expect(productRepository.update).toHaveBeenCalled();
    });

    it('Feature Flag BẬT: ném UnprocessableEntityException khi đổi type nhưng đã phát sinh giao dịch (Decision A06)', async () => {
      process.env.PRODUCT_REFACTOR_ENABLED = 'true';
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.hasTransactionHistory.mockResolvedValue(true);

      await expect(
        service.update('product-1', updateDto({ type: 'SERVICE' }), actor),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(productRepository.update).not.toHaveBeenCalled();
    });

    it('Feature Flag BẬT: cho phép đổi type khi chưa phát sinh giao dịch', async () => {
      process.env.PRODUCT_REFACTOR_ENABLED = 'true';
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.hasTransactionHistory.mockResolvedValue(false);
      productRepository.update.mockResolvedValue({
        ...baseProduct,
        type: 'SERVICE',
      });

      await service.update('product-1', updateDto({ type: 'SERVICE' }), actor);

      expect(productRepository.update).toHaveBeenCalled();
    });

    it('Feature Flag TẮT: dùng version đọc lại (existing.version) thay vì dto.version khi gọi Repository', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.update.mockResolvedValue(baseProduct);

      await service.update('product-1', updateDto({ version: 999 }), actor);

      expect(productRepository.update).toHaveBeenCalledWith(
        'product-1',
        baseProduct.version,
        expect.anything(),
      );
    });

    it('Feature Flag BẬT: dùng đúng dto.version (Optimistic Lock thật) khi gọi Repository', async () => {
      process.env.PRODUCT_REFACTOR_ENABLED = 'true';
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.update.mockResolvedValue(baseProduct);

      await service.update('product-1', updateDto({ version: 5 }), actor);

      expect(productRepository.update).toHaveBeenCalledWith(
        'product-1',
        5,
        expect.anything(),
      );
    });

    it('dịch ProductConcurrencyConflictError sang ConflictException (Optimistic Lock)', async () => {
      process.env.PRODUCT_REFACTOR_ENABLED = 'true';
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.update.mockRejectedValue(
        new ProductConcurrencyConflictError('product-1'),
      );

      await expect(
        service.update('product-1', updateDto({ name: 'x' }), actor),
      ).rejects.toThrow(ConflictException);
    });

    it('ném UnprocessableEntityException khi đổi parentProductId không hợp lệ (không phải VARIANT_CHILD)', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);

      await expect(
        service.update(
          'product-1',
          updateDto({ parentProductId: 'parent-1' }),
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(productRepository.update).not.toHaveBeenCalled();
    });

    it('Variant khác Category (Decision Q8/S03): ném UnprocessableEntityException khi đổi type=VARIANT_CHILD với categoryId khác Variant Parent', async () => {
      productRepository.findById.mockImplementation((id) =>
        Promise.resolve(
          id === 'product-1'
            ? { ...baseProduct, id: 'product-1', categoryId: 'category-1' }
            : id === 'parent-1'
              ? {
                  ...baseProduct,
                  id: 'parent-1',
                  type: 'VARIANT_PARENT',
                  categoryId: 'category-2',
                }
              : null,
        ),
      );

      await expect(
        service.update(
          'product-1',
          updateDto({ type: 'VARIANT_CHILD', parentProductId: 'parent-1' }),
          actor,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(productRepository.update).not.toHaveBeenCalled();
    });

    it('Variant khác Category: cho phép đổi type=VARIANT_CHILD khi cùng categoryId với Variant Parent', async () => {
      productRepository.findById.mockImplementation((id) =>
        Promise.resolve(
          id === 'product-1'
            ? { ...baseProduct, id: 'product-1', categoryId: 'category-1' }
            : id === 'parent-1'
              ? {
                  ...baseProduct,
                  id: 'parent-1',
                  type: 'VARIANT_PARENT',
                  categoryId: 'category-1',
                }
              : null,
        ),
      );
      productRepository.update.mockResolvedValue({
        ...baseProduct,
        type: 'VARIANT_CHILD',
        parentProductId: 'parent-1',
      });

      const result = await service.update(
        'product-1',
        updateDto({ type: 'VARIANT_CHILD', parentProductId: 'parent-1' }),
        actor,
      );

      expect(result.parentProductId).toBe('parent-1');
    });
  });

  describe('remove', () => {
    it('xóa mềm và ghi audit log', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);

      await service.remove('product-1', actor);

      expect(productRepository.softDelete).toHaveBeenCalledWith(
        'product-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product.delete' }),
      );
    });

    it('ném NotFoundException khi sản phẩm không tồn tại', async () => {
      productRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Feature Flag TẮT (mặc định): Archive dù còn Variant Active vẫn được phép, không gọi hasActiveVariantChildren', async () => {
      productRepository.findById.mockResolvedValue(baseProduct);

      await service.remove('product-1', actor);

      expect(productRepository.hasActiveVariantChildren).not.toHaveBeenCalled();
    });

    it('Feature Flag BẬT: ném UnprocessableEntityException khi còn Variant Child ACTIVE (RFC §8)', async () => {
      process.env.PRODUCT_REFACTOR_ENABLED = 'true';
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.hasActiveVariantChildren.mockResolvedValue(true);

      await expect(service.remove('product-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.softDelete).not.toHaveBeenCalled();
    });

    it('Feature Flag BẬT: cho Archive khi không còn Variant Child ACTIVE', async () => {
      process.env.PRODUCT_REFACTOR_ENABLED = 'true';
      productRepository.findById.mockResolvedValue(baseProduct);
      productRepository.hasActiveVariantChildren.mockResolvedValue(false);

      await service.remove('product-1', actor);

      expect(productRepository.softDelete).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('khôi phục sản phẩm đã xóa mềm', async () => {
      const deleted = { ...baseProduct, deletedAt: new Date() };
      productRepository.findByIdIncludingDeleted.mockResolvedValue(deleted);
      productRepository.findById.mockResolvedValue(baseProduct);

      const result = await service.restore('product-1', actor);

      expect(productRepository.restore).toHaveBeenCalledWith(
        'product-1',
        'user-1',
      );
      expect(result.deletedAt).toBeNull();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product.restore' }),
      );
    });

    it('ném NotFoundException khi sản phẩm không tồn tại', async () => {
      productRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném UnprocessableEntityException khi sản phẩm chưa bị xóa', async () => {
      productRepository.findByIdIncludingDeleted.mockResolvedValue(baseProduct);
      await expect(service.restore('product-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productRepository.restore).not.toHaveBeenCalled();
    });
  });
});
