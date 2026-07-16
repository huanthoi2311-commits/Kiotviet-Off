import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { ProductEntity } from '../domain/entities/product.entity';
import { ProductDomainService } from './product-domain.service';

describe('ProductDomainService', () => {
  let service: ProductDomainService;
  let productRepository: jest.Mocked<IProductRepository>;

  const makeProduct = (
    overrides: Partial<ProductEntity> = {},
  ): ProductEntity => ({
    id: 'product-1',
    organizationId: 'org-1',
    categoryId: 'category-1',
    brandId: null,
    unitId: 'unit-1',
    parentProductId: null,
    sku: 'SP000001',
    slug: 'san-pham-1',
    name: 'Sản phẩm 1',
    description: null,
    costPrice: '10000',
    vat: '0',
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
    prices: [],
    images: [],
    barcodes: [],
    ...overrides,
  });

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
      hasTransactionHistory: jest.fn(),
    };
    service = new ProductDomainService(productRepository);
  });

  it('findById ủy quyền thẳng cho IProductRepository.findById', async () => {
    const product = makeProduct();
    productRepository.findById.mockResolvedValue(product);

    const result = await service.findById('product-1', 'org-1');

    expect(productRepository.findById).toHaveBeenCalledWith(
      'product-1',
      'org-1',
    );
    expect(result).toBe(product);
  });

  it('findById trả null khi không tìm thấy', async () => {
    productRepository.findById.mockResolvedValue(null);

    const result = await service.findById('product-x', 'org-1');

    expect(result).toBeNull();
  });

  it('hasActiveProductsInCategory ủy quyền thẳng cho Repository', async () => {
    productRepository.hasActiveProductsInCategory.mockResolvedValue(true);

    const result = await service.hasActiveProductsInCategory('category-1');

    expect(productRepository.hasActiveProductsInCategory).toHaveBeenCalledWith(
      'category-1',
    );
    expect(result).toBe(true);
  });

  it('hasActiveProductsInBrand ủy quyền thẳng cho Repository', async () => {
    productRepository.hasActiveProductsInBrand.mockResolvedValue(false);

    const result = await service.hasActiveProductsInBrand('brand-1');

    expect(productRepository.hasActiveProductsInBrand).toHaveBeenCalledWith(
      'brand-1',
    );
    expect(result).toBe(false);
  });

  it('hasActiveProductsInUnit ủy quyền thẳng cho Repository', async () => {
    productRepository.hasActiveProductsInUnit.mockResolvedValue(true);

    const result = await service.hasActiveProductsInUnit('unit-1');

    expect(productRepository.hasActiveProductsInUnit).toHaveBeenCalledWith(
      'unit-1',
    );
    expect(result).toBe(true);
  });
});
