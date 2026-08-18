import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { BranchService } from '../../branch/application/branch.service';
import { IUserRepository } from '../../user/domain/repositories/user.repository.interface';
import { UserEntity } from '../../user/domain/entities/user.entity';
import { WarehouseEntity } from '../domain/entities/warehouse.entity';
import { IWarehouseRepository } from '../domain/repositories/warehouse.repository.interface';
import { ActorContext, WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  let service: WarehouseService;
  let warehouseRepository: jest.Mocked<IWarehouseRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;
  let branchService: jest.Mocked<Pick<BranchService, 'getById'>>;
  let userRepository: jest.Mocked<IUserRepository>;

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

  const makeUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
    id: 'user-manager-1',
    organizationId: 'org-1',
    branchId: null,
    username: 'manager1',
    fullName: 'Manager One',
    email: 'manager1@acme.com',
    phone: null,
    avatar: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
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
    // T053.05A — mặc định thành công (branch/manager cùng tổ chức) để các test hiện có (không
    // liên quan tenant-hardening) không cần sửa; các test C2/C3/C6/C7/U2/U3/U7/U8 tự override.
    branchService = {
      getById: jest
        .fn()
        .mockResolvedValue({ id: 'branch-1', organizationId: 'org-1' }),
    };
    userRepository = {
      findById: jest.fn().mockResolvedValue(makeUser()),
      search: jest.fn(),
      existsByUsername: jest.fn(),
      existsByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      updatePasswordHash: jest.fn(),
    };

    service = new WarehouseService(
      warehouseRepository,
      auditLogService as unknown as AuditLogService,
      branchService as unknown as BranchService,
      userRepository,
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

    it('C1: branchId cùng tổ chức → BranchService.getById được gọi với branchId + actor, repository.create được gọi', async () => {
      warehouseRepository.create.mockResolvedValue(makeWarehouse());
      await service.create(
        { branchId: 'branch-1', code: 'KHO-01', name: 'Kho Chính' },
        actor,
      );
      expect(branchService.getById).toHaveBeenCalledWith('branch-1', {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
      expect(warehouseRepository.create).toHaveBeenCalled();
    });

    it('C2: branchId không tồn tại → BRANCH_001, repository.create KHÔNG được gọi', async () => {
      branchService.getById.mockRejectedValue(
        new NotFoundException({
          errorCode: 'BRANCH_001',
          message: 'Không tìm thấy chi nhánh',
        }),
      );
      await expect(
        service.create(
          { branchId: 'missing-branch', code: 'KHO-01', name: 'Kho Chính' },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'BRANCH_001' }),
      });
      expect(warehouseRepository.create).not.toHaveBeenCalled();
    });

    it('C3: branchId thuộc tổ chức khác → CÙNG BRANCH_001 như C2 (non-disclosing), repository.create KHÔNG được gọi', async () => {
      // IWarehouseRepository/BranchService.getById không phân biệt "không tồn tại" và "khác tổ
      // chức" — cùng ném NotFoundException(BRANCH_001) (xem doc-comment IUserRepository/thực tế
      // BranchService.findOrThrow: branchRepository.findById(id, organizationId) trả null như
      // nhau cho cả 2 trường hợp).
      branchService.getById.mockRejectedValue(
        new NotFoundException({
          errorCode: 'BRANCH_001',
          message: 'Không tìm thấy chi nhánh',
        }),
      );
      await expect(
        service.create(
          { branchId: 'org-b-branch', code: 'KHO-01', name: 'Kho Chính' },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'BRANCH_001' }),
      });
      expect(warehouseRepository.create).not.toHaveBeenCalled();
    });

    it('C4: managerId cùng tổ chức → thành công, USER_REPOSITORY.findById được gọi với managerId + actor.organizationId', async () => {
      warehouseRepository.create.mockResolvedValue(
        makeWarehouse({ managerId: 'user-manager-1' }),
      );
      await service.create(
        {
          branchId: 'branch-1',
          managerId: 'user-manager-1',
          code: 'KHO-01',
          name: 'Kho Chính',
        },
        actor,
      );
      expect(userRepository.findById).toHaveBeenCalledWith(
        'user-manager-1',
        actor.organizationId,
      );
      expect(warehouseRepository.create).toHaveBeenCalled();
    });

    it('C5: managerId bỏ trống → KHÔNG tra User, vẫn thành công', async () => {
      warehouseRepository.create.mockResolvedValue(makeWarehouse());
      await service.create(
        { branchId: 'branch-1', code: 'KHO-01', name: 'Kho Chính' },
        actor,
      );
      expect(userRepository.findById).not.toHaveBeenCalled();
      expect(warehouseRepository.create).toHaveBeenCalled();
    });

    it('C6: managerId không tồn tại → USER_001, repository.create KHÔNG được gọi', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.create(
          {
            branchId: 'branch-1',
            managerId: 'missing-user',
            code: 'KHO-01',
            name: 'Kho Chính',
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'USER_001' }),
      });
      expect(warehouseRepository.create).not.toHaveBeenCalled();
    });

    it('C7: managerId thuộc tổ chức khác → CÙNG USER_001 như C6 (non-disclosing — IUserRepository.findById trả null như nhau), repository.create KHÔNG được gọi', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.create(
          {
            branchId: 'branch-1',
            managerId: 'org-b-user',
            code: 'KHO-01',
            name: 'Kho Chính',
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'USER_001' }),
      });
      expect(warehouseRepository.create).not.toHaveBeenCalled();
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

    it('U1: đổi branchId sang branch cùng tổ chức → thành công, BranchService.getById được gọi với branchId + actor', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      warehouseRepository.update.mockResolvedValue(
        makeWarehouse({ branchId: 'branch-2' }),
      );
      await service.update('wh-1', { branchId: 'branch-2' }, actor);
      expect(branchService.getById).toHaveBeenCalledWith('branch-2', {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
      expect(warehouseRepository.update).toHaveBeenCalled();
    });

    it('U2: đổi branchId sang branch không tồn tại → BRANCH_001, repository.update KHÔNG được gọi', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      branchService.getById.mockRejectedValue(
        new NotFoundException({
          errorCode: 'BRANCH_001',
          message: 'Không tìm thấy chi nhánh',
        }),
      );
      await expect(
        service.update('wh-1', { branchId: 'missing-branch' }, actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'BRANCH_001' }),
      });
      expect(warehouseRepository.update).not.toHaveBeenCalled();
    });

    it('U3: đổi branchId sang branch tổ chức khác → CÙNG BRANCH_001 như U2 (non-disclosing), repository.update KHÔNG được gọi', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      branchService.getById.mockRejectedValue(
        new NotFoundException({
          errorCode: 'BRANCH_001',
          message: 'Không tìm thấy chi nhánh',
        }),
      );
      await expect(
        service.update('wh-1', { branchId: 'org-b-branch' }, actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'BRANCH_001' }),
      });
      expect(warehouseRepository.update).not.toHaveBeenCalled();
    });

    it('U4: đổi managerId sang user cùng tổ chức → thành công', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      warehouseRepository.update.mockResolvedValue(
        makeWarehouse({ managerId: 'user-manager-2' }),
      );
      await service.update('wh-1', { managerId: 'user-manager-2' }, actor);
      expect(userRepository.findById).toHaveBeenCalledWith(
        'user-manager-2',
        actor.organizationId,
      );
      expect(warehouseRepository.update).toHaveBeenCalled();
    });

    it('U5: managerId bỏ trống (undefined) → KHÔNG tra User, manager hiện có giữ nguyên (chỉ trường khác được đổi)', async () => {
      warehouseRepository.findById.mockResolvedValue(
        makeWarehouse({ managerId: 'existing-manager' }),
      );
      warehouseRepository.update.mockResolvedValue(
        makeWarehouse({
          managerId: 'existing-manager',
          name: 'Kho Chính (đã sửa)',
        }),
      );
      await service.update('wh-1', { name: 'Kho Chính (đã sửa)' }, actor);
      expect(userRepository.findById).not.toHaveBeenCalled();
      expect(warehouseRepository.update).toHaveBeenCalledWith(
        'wh-1',
        expect.objectContaining({ name: 'Kho Chính (đã sửa)' }),
      );
      const [, updateArg] = warehouseRepository.update.mock.calls[0];
      expect(Object.prototype.hasOwnProperty.call(updateArg, 'managerId')).toBe(
        false,
      );
    });

    it('U6: managerId = null → xoá manager, KHÔNG cần tra User', async () => {
      warehouseRepository.findById.mockResolvedValue(
        makeWarehouse({ managerId: 'existing-manager' }),
      );
      warehouseRepository.update.mockResolvedValue(
        makeWarehouse({ managerId: null }),
      );
      await service.update('wh-1', { managerId: null }, actor);
      expect(userRepository.findById).not.toHaveBeenCalled();
      expect(warehouseRepository.update).toHaveBeenCalledWith(
        'wh-1',
        expect.objectContaining({ managerId: null }),
      );
    });

    it('U7: đổi managerId sang user không tồn tại → USER_001, repository.update KHÔNG được gọi', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('wh-1', { managerId: 'missing-user' }, actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'USER_001' }),
      });
      expect(warehouseRepository.update).not.toHaveBeenCalled();
    });

    it('U8: đổi managerId sang user tổ chức khác → CÙNG USER_001 như U7 (non-disclosing), repository.update KHÔNG được gọi', async () => {
      warehouseRepository.findById.mockResolvedValue(makeWarehouse());
      userRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('wh-1', { managerId: 'org-b-user' }, actor),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: 'USER_001' }),
      });
      expect(warehouseRepository.update).not.toHaveBeenCalled();
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
