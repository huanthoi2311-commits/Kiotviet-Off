import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { BarcodeDomainService } from '../../barcode/application/barcode-domain.service';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { UnitEntity } from '../domain/entities/unit.entity';
import { UnitConcurrencyConflictError } from '../domain/errors/unit.errors';
import { IUnitRepository } from '../domain/repositories/unit.repository.interface';
import { ActorContext, UnitService } from './unit.service';

describe('UnitService', () => {
  let service: UnitService;
  let unitRepository: jest.Mocked<IUnitRepository>;
  let productDomainService: jest.Mocked<
    Pick<ProductDomainService, 'hasActiveProductsInUnit'>
  >;
  let barcodeDomainService: jest.Mocked<
    Pick<BarcodeDomainService, 'hasActiveBarcodesInUnit'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeUnit = (overrides: Partial<UnitEntity> = {}): UnitEntity => ({
    id: 'unit-1',
    organizationId: 'org-1',
    code: 'CAI',
    name: 'Cái',
    symbol: 'cái',
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    unitRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
    };
    productDomainService = {
      hasActiveProductsInUnit: jest.fn().mockResolvedValue(false),
    };
    barcodeDomainService = {
      hasActiveBarcodesInUnit: jest.fn().mockResolvedValue(false),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new UnitService(
      unitRepository,
      productDomainService as unknown as ProductDomainService,
      barcodeDomainService as unknown as BarcodeDomainService,
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
        makeUnit({ name: 'Cái (đã sửa)', version: 2 }),
      );
      const result = await service.update(
        'unit-1',
        { version: 1, name: 'Cái (đã sửa)' },
        actor,
      );
      expect(result.name).toBe('Cái (đã sửa)');
      expect(unitRepository.update).toHaveBeenCalledWith(
        'unit-1',
        'org-1',
        1,
        expect.objectContaining({ name: 'Cái (đã sửa)' }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'unit.update' }),
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      unitRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { version: 1, name: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('dịch UnitConcurrencyConflictError sang ConflictException 409', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      unitRepository.update.mockRejectedValue(
        new UnitConcurrencyConflictError('unit-1'),
      );
      await expect(
        service.update('unit-1', { version: 1, name: 'x' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('restore', () => {
    it('ném NotFoundException khi không tồn tại (kể cả đã xóa)', async () => {
      unitRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném lỗi nghiệp vụ khi unit chưa bị xóa mềm', async () => {
      unitRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeUnit({ deletedAt: null }),
      );
      await expect(service.restore('unit-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(unitRepository.restore).not.toHaveBeenCalled();
    });

    it('khôi phục thành công, status luôn về INACTIVE, ghi audit log', async () => {
      unitRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeUnit({ deletedAt: new Date('2026-01-02'), status: 'ARCHIVED' }),
      );
      unitRepository.findById.mockResolvedValue(
        makeUnit({ status: 'INACTIVE', deletedAt: null }),
      );
      const result = await service.restore('unit-1', actor);
      expect(result.status).toBe('INACTIVE');
      expect(unitRepository.restore).toHaveBeenCalledWith(
        'unit-1',
        'org-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'unit.restore' }),
      );
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

    it('chặn xóa khi còn Barcode sử dụng đơn vị tính (Decision RQ5/UP07)', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      barcodeDomainService.hasActiveBarcodesInUnit.mockResolvedValue(true);
      await expect(service.remove('unit-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(unitRepository.softDelete).not.toHaveBeenCalled();
    });

    it('xóa mềm thành công khi không còn sản phẩm lẫn mã vạch', async () => {
      unitRepository.findById.mockResolvedValue(makeUnit());
      await service.remove('unit-1', actor);
      expect(barcodeDomainService.hasActiveBarcodesInUnit).toHaveBeenCalledWith(
        'unit-1',
      );
      expect(unitRepository.softDelete).toHaveBeenCalledWith(
        'unit-1',
        'org-1',
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
