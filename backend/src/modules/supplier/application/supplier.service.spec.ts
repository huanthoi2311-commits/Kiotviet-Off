import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { SupplierEntity } from '../domain/entities/supplier.entity';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { ActorContext, SupplierService } from './supplier.service';

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepository: jest.Mocked<ISupplierRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeSupplier = (
    overrides: Partial<SupplierEntity> = {},
  ): SupplierEntity => ({
    id: 'sup-1',
    organizationId: 'org-1',
    code: 'NCC001',
    taxCode: null,
    companyName: 'Công ty Đức An',
    contactName: null,
    phone: null,
    email: null,
    website: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    bankName: null,
    bankAccount: null,
    paymentTerm: null,
    creditLimit: null,
    status: 'ACTIVE',
    note: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    supplierRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      findAllForExport: jest.fn(),
      existsByCode: jest.fn(),
      hasPurchaseOrders: jest.fn().mockResolvedValue(false),
      importBatch: jest.fn(),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new SupplierService(
      supplierRepository,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tạo thành công và ghi audit log', async () => {
      supplierRepository.create.mockResolvedValue(makeSupplier());
      const result = await service.create(
        { code: 'NCC001', companyName: 'Công ty Đức An' },
        actor,
      );
      expect(result.code).toBe('NCC001');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.create' }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về supplier khi tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      const result = await service.findOne('sup-1', 'org-1');
      expect(result.id).toBe('sup-1');
    });
  });

  describe('search', () => {
    it('map query sang search params đầy đủ', async () => {
      supplierRepository.search.mockResolvedValue({
        items: [makeSupplier()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ search: 'Đức An' }, 'org-1');
      expect(result.total).toBe(1);
      expect(supplierRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'Đức An',
          page: 1,
          limit: 20,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      );
    });
  });

  describe('update', () => {
    it('cập nhật thành công, ghi audit log old/new', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      supplierRepository.update.mockResolvedValue(
        makeSupplier({ companyName: 'Đổi tên' }),
      );
      const result = await service.update(
        'sup-1',
        { companyName: 'Đổi tên' },
        actor,
      );
      expect(result.companyName).toBe('Đổi tên');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.update' }),
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { companyName: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('chặn xóa khi đã có Purchase Order', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      supplierRepository.hasPurchaseOrders.mockResolvedValue(true);
      await expect(service.remove('sup-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(supplierRepository.softDelete).not.toHaveBeenCalled();
    });

    it('xóa mềm thành công khi chưa có Purchase Order', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      await service.remove('sup-1', actor);
      expect(supplierRepository.softDelete).toHaveBeenCalledWith(
        'sup-1',
        'user-1',
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném UnprocessableEntityException khi chưa bị xóa', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeSupplier(),
      );
      await expect(service.restore('sup-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('khôi phục thành công', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeSupplier({ deletedAt: new Date('2026-02-01') }),
      );
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ deletedAt: null }),
      );
      const result = await service.restore('sup-1', actor);
      expect(result.deletedAt).toBeNull();
      expect(supplierRepository.restore).toHaveBeenCalledWith(
        'sup-1',
        'user-1',
      );
    });
  });
});
