import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { BrandEntity } from '../domain/entities/brand.entity';
import { IBrandRepository } from '../domain/repositories/brand.repository.interface';
import { ActorContext, BrandService } from './brand.service';

describe('BrandService', () => {
  let service: BrandService;
  let brandRepository: jest.Mocked<IBrandRepository>;
  let productDomainService: jest.Mocked<
    Pick<ProductDomainService, 'hasActiveProductsInBrand'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeBrand = (overrides: Partial<BrandEntity> = {}): BrandEntity => ({
    id: 'brand-1',
    organizationId: 'org-1',
    code: 'NIKE',
    name: 'Nike',
    logo: null,
    description: null,
    website: null,
    country: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    brandRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
    };
    productDomainService = {
      hasActiveProductsInBrand: jest.fn().mockResolvedValue(false),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new BrandService(
      brandRepository,
      productDomainService as unknown as ProductDomainService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tạo thương hiệu thành công và ghi audit log', async () => {
      brandRepository.create.mockResolvedValue(makeBrand());
      const result = await service.create(
        { code: 'NIKE', name: 'Nike' },
        actor,
      );
      expect(result.code).toBe('NIKE');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'brand.create' }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      brandRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về brand khi tồn tại', async () => {
      brandRepository.findById.mockResolvedValue(makeBrand());
      const result = await service.findOne('brand-1', 'org-1');
      expect(result.id).toBe('brand-1');
    });
  });

  describe('search', () => {
    it('map query sang search params và trả kết quả phân trang', async () => {
      brandRepository.search.mockResolvedValue({
        items: [makeBrand()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ search: 'nike' }, 'org-1');
      expect(result.total).toBe(1);
      expect(brandRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'nike',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('update', () => {
    it('cập nhật thành công, ghi audit log old/new', async () => {
      brandRepository.findById.mockResolvedValue(makeBrand());
      brandRepository.update.mockResolvedValue(
        makeBrand({ name: 'Nike Inc.' }),
      );
      const result = await service.update(
        'brand-1',
        { name: 'Nike Inc.' },
        actor,
      );
      expect(result.name).toBe('Nike Inc.');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'brand.update' }),
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      brandRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('chặn xóa khi còn sản phẩm sử dụng thương hiệu', async () => {
      brandRepository.findById.mockResolvedValue(makeBrand());
      productDomainService.hasActiveProductsInBrand.mockResolvedValue(true);
      await expect(service.remove('brand-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(brandRepository.softDelete).not.toHaveBeenCalled();
    });

    it('xóa mềm thành công khi không còn sản phẩm', async () => {
      brandRepository.findById.mockResolvedValue(makeBrand());
      await service.remove('brand-1', actor);
      expect(brandRepository.softDelete).toHaveBeenCalledWith(
        'brand-1',
        'user-1',
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      brandRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
