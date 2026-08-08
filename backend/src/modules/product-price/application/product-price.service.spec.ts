import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { ProductPriceConcurrencyConflictError } from '../domain/errors/product-price.errors';
import { IProductPriceRepository } from '../domain/repositories/product-price.repository.interface';
import { ReplaceProductPriceSetDto } from './dto/replace-product-price-set.dto';
import { ActorContext, ProductPriceService } from './product-price.service';

describe('ProductPriceService', () => {
  let service: ProductPriceService;
  let productPriceRepository: jest.Mocked<IProductPriceRepository>;
  let productDomainService: { findById: jest.Mock };
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    ip: '127.0.0.1',
    userAgent: 'jest',
  };

  const existingSet = {
    priceVersion: 1,
    prices: [{ id: 'price-1', type: 'RETAIL' as const, price: '150000' }],
  };

  const replaceDto = (
    overrides: Partial<ReplaceProductPriceSetDto> = {},
  ): ReplaceProductPriceSetDto => ({
    priceVersion: 1,
    prices: [{ type: 'RETAIL', price: 160000 }],
    ...overrides,
  });

  beforeEach(() => {
    productPriceRepository = {
      findSetByProductId: jest.fn(),
      replaceSet: jest.fn(),
    };
    productDomainService = {
      findById: jest.fn().mockResolvedValue({ id: 'product-1' }),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ProductPriceService(
      productPriceRepository,
      productDomainService as unknown as ProductDomainService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('findSet', () => {
    it('trả về price set khi Product tồn tại', async () => {
      productPriceRepository.findSetByProductId.mockResolvedValue(existingSet);

      const result = await service.findSet('product-1', 'org-1');

      expect(result.productId).toBe('product-1');
      expect(result.priceVersion).toBe(1);
      expect(result.prices).toEqual(existingSet.prices);
    });

    it('ném NotFoundException khi Product không tồn tại/không thuộc organization', async () => {
      productDomainService.findById.mockResolvedValue(null);

      await expect(service.findSet('product-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(productPriceRepository.findSetByProductId).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi Product tồn tại nhưng price set không tìm thấy', async () => {
      productPriceRepository.findSetByProductId.mockResolvedValue(null);

      await expect(service.findSet('product-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replaceSet', () => {
    it('thay thế thành công, ghi audit log old/new, trả về set mới', async () => {
      productPriceRepository.findSetByProductId.mockResolvedValue(existingSet);
      productPriceRepository.replaceSet.mockResolvedValue({
        priceVersion: 2,
        prices: [{ id: 'price-2', type: 'RETAIL', price: '160000' }],
      });

      const result = await service.replaceSet('product-1', replaceDto(), actor);

      expect(productPriceRepository.replaceSet).toHaveBeenCalledWith(
        'product-1',
        1,
        [{ type: 'RETAIL', price: 160000 }],
        'user-1',
      );
      expect(result.priceVersion).toBe(2);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'product-price.update',
          entityType: 'ProductPrice',
          entityId: 'product-1',
        }),
      );
    });

    it('ném NotFoundException khi Product không tồn tại/không thuộc organization', async () => {
      productDomainService.findById.mockResolvedValue(null);

      await expect(
        service.replaceSet('product-1', replaceDto(), actor),
      ).rejects.toThrow(NotFoundException);
      expect(productPriceRepository.replaceSet).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException (PRODUCT_PRICE_DUPLICATE_TYPE) khi trùng type', async () => {
      const dto = replaceDto({
        prices: [
          { type: 'RETAIL', price: 100000 },
          { type: 'RETAIL', price: 200000 },
        ],
      });

      await expect(service.replaceSet('product-1', dto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productPriceRepository.replaceSet).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException (PRODUCT_MISSING_RETAIL_PRICE) khi không còn RETAIL', async () => {
      const dto = replaceDto({
        prices: [{ type: 'WHOLESALE', price: 100000 }],
      });

      await expect(service.replaceSet('product-1', dto, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(productPriceRepository.replaceSet).not.toHaveBeenCalled();
    });

    it('dịch ProductPriceConcurrencyConflictError sang ConflictException (PRODUCT_PRICE_VERSION_CONFLICT)', async () => {
      productPriceRepository.findSetByProductId.mockResolvedValue(existingSet);
      productPriceRepository.replaceSet.mockRejectedValue(
        new ProductPriceConcurrencyConflictError('product-1'),
      );

      await expect(
        service.replaceSet(
          'product-1',
          replaceDto({ priceVersion: 99 }),
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
