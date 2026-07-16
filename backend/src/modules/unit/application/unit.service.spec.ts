import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { UnitEntity } from '../domain/entities/unit.entity';
import { IUnitRepository } from '../domain/repositories/unit.repository.interface';
import { ActorContext, UnitService } from './unit.service';

describe('UnitService', () => {
  let service: UnitService;
  let unitRepository: jest.Mocked<IUnitRepository>;
  let productDomainService: jest.Mocked<
    Pick<ProductDomainService, 'hasActiveProductsInUnit'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeUnit = (overrides: Partial<UnitEntity> = {}): UnitEntity => ({
    id: 'unit-1',
    organizationId: 'org-1',
    code: 'CAI',
    name: 'Cái',
    symbol: 'cái',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    unitRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
    };
    productDomainService = {
      hasActiveProductsInUnit: jest.fn().mockResolvedValue(false),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new UnitService(
      unitRepository,
      productDomainService as unknown as ProductDomainService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tạo đơn vị tính thành công và ghi audit log', async () => {
      unitRepository.create.mockResolvedValue(makeUnit());
      const result = await service.create(
        { code: 'CAI', name: 'Cái', symbol: 'cái' },
        actor,
      );
      expect(result.code).toBe('CAI');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'unit.create' }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      unitRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về unit khi tồn tại', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      const result = await service.findOne('unit-1', 'org-1');
      expect(result.id).toBe('unit-1');
    });
  });

  describe('search', () => {
    it('map query sang search params và trả kết quả phân trang', async () => {
      unitRepository.search.mockResolvedValue({
        items: [makeUnit()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ search: 'cai' }, 'org-1');
      expect(result.total).toBe(1);
      expect(unitRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'cai',
          page: 1,
          limit: 20,
        }),
      );
    });
  });

  describe('update', () => {
    it('cập nhật thành công, ghi audit log old/new', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      unitRepository.update.mockResolvedValue(
        makeUnit({ name: 'Cái (đã sửa)' }),
      );
      const result = await service.update(
        'unit-1',
        { name: 'Cái (đã sửa)' },
        actor,
      );
      expect(result.name).toBe('Cái (đã sửa)');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'unit.update' }),
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      unitRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('chặn xóa khi còn sản phẩm sử dụng đơn vị tính', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      productDomainService.hasActiveProductsInUnit.mockResolvedValue(true);
      await expect(service.remove('unit-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(unitRepository.softDelete).not.toHaveBeenCalled();
    });

    it('xóa mềm thành công khi không còn sản phẩm', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      await service.remove('unit-1', actor);
      expect(unitRepository.softDelete).toHaveBeenCalledWith(
        'unit-1',
        'user-1',
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      unitRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
