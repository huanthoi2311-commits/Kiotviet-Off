import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductEntity } from '../domain/entities/product.entity';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { ISkuGenerator } from '../domain/services/sku-generator.interface';
import { ISlugGenerator } from '../domain/services/slug-generator.interface';
import { CreateProductDto } from './dto/create-product.dto';
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
    name: 'Áo thun nam',
    costPrice: 90000,
    prices: [{ type: 'RETAIL', price: 150000 }],
  };

  beforeEach(() => {
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
        { name: 'Áo thun nam mới' },
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

      await service.update('product-1', { costPrice: 95000 }, actor);

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
        service.update('missing', { name: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
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
