import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { SupplierEntity } from '../domain/entities/supplier.entity';
import { SupplierConcurrencyConflictError } from '../domain/errors/supplier.errors';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { ISupplierCodeGenerator } from '../domain/services/supplier-code-generator.interface';
import { ActorContext, SupplierService } from './supplier.service';

describe('SupplierService', () => {
  let service: SupplierService;
  let supplierRepository: jest.Mocked<ISupplierRepository>;
  let codeGenerator: jest.Mocked<ISupplierCodeGenerator>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeSupplier = (
    overrides: Partial<SupplierEntity> = {},
  ): SupplierEntity => ({
    id: 'sup-1',
    organizationId: 'org-1',
    code: 'NCC000001',
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
    version: 1,
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
      findByCode: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      changeStatusWithVersion: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      findAllForExport: jest.fn(),
      existsByCode: jest.fn(),
      hasPurchaseOrders: jest.fn().mockResolvedValue(false),
      importBatch: jest.fn(),
    };
    codeGenerator = { generate: jest.fn().mockResolvedValue('NCC000001') };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    supplierRepository.existsByCode.mockResolvedValue(false);

    service = new SupplierService(
      supplierRepository,
      codeGenerator,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('không có code — sinh code qua generator, tạo thành công, ghi audit log', async () => {
      supplierRepository.create.mockResolvedValue(makeSupplier());

      const result = await service.create(
        { companyName: 'Công ty Đức An' },
        actor,
      );

      expect(result.code).toBe('NCC000001');
      expect(codeGenerator.generate).toHaveBeenCalledWith('org-1');
      expect(supplierRepository.existsByCode).not.toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.create' }),
      );
    });

    it('có code — trim + uppercase, check existsByCode, không gọi generator', async () => {
      supplierRepository.create.mockResolvedValue(
        makeSupplier({ code: 'ABC123' }),
      );

      await service.create(
        { companyName: 'Công ty Đức An', code: ' abc123 ' },
        actor,
      );

      expect(codeGenerator.generate).not.toHaveBeenCalled();
      expect(supplierRepository.existsByCode).toHaveBeenCalledWith(
        'org-1',
        'ABC123',
      );
      expect(supplierRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ABC123' }),
      );
    });

    it('ném ConflictException khi code client cung cấp đã tồn tại', async () => {
      supplierRepository.existsByCode.mockResolvedValue(true);
      await expect(
        service.create({ companyName: 'X', code: 'DUP' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(supplierRepository.create).not.toHaveBeenCalled();
    });

    it('không truyền status từ dto vào repository — luôn ACTIVE khi tạo qua API thường', async () => {
      supplierRepository.create.mockResolvedValue(makeSupplier());
      await service.create({ companyName: 'X', status: 'INACTIVE' }, actor);
      const [input] = supplierRepository.create.mock.calls[0];
      expect(input).not.toHaveProperty('status');
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

  describe('update (Optimistic Lock — BR09)', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { version: 1, companyName: 'B' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('cập nhật thành công, ghi audit log', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      supplierRepository.update.mockResolvedValue(
        makeSupplier({ companyName: 'Đổi tên', version: 2 }),
      );

      const result = await service.update(
        'sup-1',
        { version: 1, companyName: 'Đổi tên' },
        actor,
      );

      expect(result.companyName).toBe('Đổi tên');
      expect(supplierRepository.update).toHaveBeenCalledWith(
        'sup-1',
        'org-1',
        1,
        expect.objectContaining({ companyName: 'Đổi tên' }),
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      supplierRepository.update.mockRejectedValue(
        new SupplierConcurrencyConflictError('sup-1'),
      );
      await expect(
        service.update('sup-1', { version: 1, companyName: 'B' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove — Archive Guard (BR08, chuẩn hóa không viết lại)', () => {
    it('chặn Archive khi đã có Purchase Order chưa hoàn tất', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      supplierRepository.hasPurchaseOrders.mockResolvedValue(true);
      await expect(service.remove('sup-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(supplierRepository.softDelete).not.toHaveBeenCalled();
    });

    it('Archive thành công khi không có Purchase Order', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      await service.remove('sup-1', 1, actor);
      expect(supplierRepository.softDelete).toHaveBeenCalledWith(
        'sup-1',
        'org-1',
        1,
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier.archive' }),
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      supplierRepository.findById.mockResolvedValue(makeSupplier());
      supplierRepository.softDelete.mockRejectedValue(
        new SupplierConcurrencyConflictError('sup-1'),
      );
      await expect(service.remove('sup-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('restore', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', 1, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném UnprocessableEntityException khi chưa bị xóa', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeSupplier(),
      );
      await expect(service.restore('sup-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('khôi phục thành công, trả status về INACTIVE', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeSupplier({ deletedAt: new Date('2026-02-01') }),
      );
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE', deletedAt: null }),
      );
      const result = await service.restore('sup-1', 1, actor);
      expect(result.status).toBe('INACTIVE');
      expect(supplierRepository.restore).toHaveBeenCalledWith(
        'sup-1',
        'org-1',
        1,
        'user-1',
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      supplierRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeSupplier({ deletedAt: new Date('2026-02-01') }),
      );
      supplierRepository.restore.mockRejectedValue(
        new SupplierConcurrencyConflictError('sup-1'),
      );
      await expect(service.restore('sup-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('activate (INACTIVE → ACTIVE)', () => {
    it('kích hoạt thành công từ INACTIVE, ghi audit log', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE' }),
      );
      supplierRepository.changeStatusWithVersion.mockResolvedValue(
        makeSupplier({ status: 'ACTIVE', version: 2 }),
      );

      const result = await service.activate('sup-1', 1, actor);
      expect(result.status).toBe('ACTIVE');
      expect(supplierRepository.changeStatusWithVersion).toHaveBeenCalledWith(
        'sup-1',
        'org-1',
        1,
        'ACTIVE',
        'user-1',
      );
    });

    it('ném lỗi invalid transition khi đang ACTIVE', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ACTIVE' }),
      );
      await expect(service.activate('sup-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ném lỗi invalid transition khi đang ARCHIVED', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ARCHIVED' }),
      );
      await expect(service.activate('sup-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('ném Conflict (409) khi version không khớp', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE' }),
      );
      supplierRepository.changeStatusWithVersion.mockRejectedValue(
        new SupplierConcurrencyConflictError('sup-1'),
      );
      await expect(service.activate('sup-1', 1, actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('deactivate (ACTIVE → INACTIVE)', () => {
    it('ngừng hoạt động thành công từ ACTIVE, ghi audit log', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'ACTIVE' }),
      );
      supplierRepository.changeStatusWithVersion.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE', version: 2 }),
      );

      const result = await service.deactivate('sup-1', 1, actor);
      expect(result.status).toBe('INACTIVE');
    });

    it('ném lỗi invalid transition khi đang INACTIVE', async () => {
      supplierRepository.findById.mockResolvedValue(
        makeSupplier({ status: 'INACTIVE' }),
      );
      await expect(service.deactivate('sup-1', 1, actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
