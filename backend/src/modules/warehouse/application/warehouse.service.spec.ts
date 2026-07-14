import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { WarehouseEntity } from '../domain/entities/warehouse.entity';
import { IWarehouseRepository } from '../domain/repositories/warehouse.repository.interface';
import { ActorContext, WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let warehouseRepository: jest.Mocked<IWarehouseRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const makeWarehouse = (
    overrides: Partial<WarehouseEntity> = {},
  ): WarehouseEntity => ({
    id: 'wh-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    managerId: null,
    code: 'KHO-01',
    name: 'Kho Chính',
    type: 'MAIN',
    address: null,
    phone: null,
    email: null,
    description: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    warehouseRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      search: jest.fn(),
      existsByCode: jest.fn(),
      hasStockOrTransactions: jest.fn().mockResolvedValue(false),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new WarehouseService(
      warehouseRepository,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('create', () => {
    it('tạo kho thành công và ghi audit log', async () => {
      warehouseRepository.create.mockResolvedValue(makeWarehouse());
      const result = await service.create(
        { branchId: 'branch-1', code: 'KHO-01', name: 'Kho Chính' },
        actor,
      );
      expect(result.code).toBe('KHO-01');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'warehouse.create' }),
      );
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      warehouseRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('missing', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về warehouse khi tồn tại', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      const result = await service.findOne('wh-1', 'org-1');
      expect(result.id).toBe('wh-1');
    });
  });

  describe('search', () => {
    it('map query sang search params đầy đủ (kèm sortBy/sortOrder mặc định)', async () => {
      warehouseRepository.search.mockResolvedValue({
        items: [makeWarehouse()],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({ search: 'kho' }, 'org-1');
      expect(result.total).toBe(1);
      expect(warehouseRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          search: 'kho',
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
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      warehouseRepository.update.mockResolvedValue(
        makeWarehouse({ name: 'Kho Chính (đã sửa)' }),
      );
      const result = await service.update(
        'wh-1',
        { name: 'Kho Chính (đã sửa)' },
        actor,
      );
      expect(result.name).toBe('Kho Chính (đã sửa)');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'warehouse.update' }),
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      warehouseRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { name: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('chặn xóa khi còn tồn kho hoặc giao dịch', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      warehouseRepository.hasStockOrTransactions.mockResolvedValue(true);
      await expect(service.remove('wh-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(warehouseRepository.softDelete).not.toHaveBeenCalled();
    });

    it('xóa mềm thành công khi không còn tồn kho/giao dịch', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      await service.remove('wh-1', actor);
      expect(warehouseRepository.softDelete).toHaveBeenCalledWith(
        'wh-1',
        'user-1',
      );
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      warehouseRepository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('ném NotFoundException khi không tồn tại', async () => {
      warehouseRepository.findByIdIncludingDeleted.mockResolvedValue(null);
      await expect(service.restore('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ném UnprocessableEntityException khi chưa bị xóa', async () => {
      warehouseRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeWarehouse(),
      );
      await expect(service.restore('wh-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('khôi phục thành công và ghi audit log', async () => {
      warehouseRepository.findByIdIncludingDeleted.mockResolvedValue(
        makeWarehouse({ deletedAt: new Date('2026-02-01') }),
      );
      warehouseRepository.findById.mockResolvedValue(
        makeWarehouse({ deletedAt: null }),
      );
      const result = await service.restore('wh-1', actor);
      expect(result.deletedAt).toBeNull();
      expect(warehouseRepository.restore).toHaveBeenCalledWith(
        'wh-1',
        'user-1',
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'warehouse.restore' }),
      );
    });
  });
});
