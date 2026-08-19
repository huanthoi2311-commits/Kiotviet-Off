import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserReferenceService } from '../../user/application/user-reference.service';
import { WarehouseReferenceService } from '../../warehouse/application/warehouse-reference.service';
import {
  BranchHasActiveWarehouseError,
  BranchInvoicePrefixConflictError,
  BranchOrganizationMinOneActiveError,
} from '../domain/repositories/branch.repository.interface';
import type { IBranchRepository } from '../domain/repositories/branch.repository.interface';
import type { IBranchCodeGenerator } from '../domain/services/branch-code-generator.interface';
import { ActorContext, BranchService } from './branch.service';

describe('BranchService', () => {
  let service: BranchService;
  let branchRepository: jest.Mocked<IBranchRepository>;
  let codeGenerator: jest.Mocked<IBranchCodeGenerator>;
  let userReferenceService: jest.Mocked<Pick<UserReferenceService, 'findById'>>;
  let warehouseReferenceService: jest.Mocked<
    Pick<WarehouseReferenceService, 'findById'>
  >;

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

  const user = { id: 'user-2', organizationId: 'org-1' } as never;
  const warehouse = { id: 'warehouse-1', organizationId: 'org-1' } as never;

  const branch = {
    id: 'branch-1',
    organizationId: 'org-1',
    managerUserId: null,
    defaultWarehouseId: null,
    code: 'BR000001',
    name: 'Chi nhánh HN',
    email: null,
    address: null,
    province: null,
    district: null,
    ward: null,
    phone: null,
    invoicePrefix: 'HN',
    receiptPrefix: null,
    timezone: 'Asia/Ho_Chi_Minh',
    currencyCode: 'VND',
    isMain: false,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    branchRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      update: jest.fn(),
      archive: jest.fn(),
      setDefault: jest.fn(),
      existsByInvoicePrefix: jest.fn(),
      countActiveByOrganization: jest.fn(),
    };
    codeGenerator = { generate: jest.fn() };
    userReferenceService = { findById: jest.fn() };
    warehouseReferenceService = { findById: jest.fn() };
    service = new BranchService(
      branchRepository,
      codeGenerator,
      userReferenceService as unknown as UserReferenceService,
      warehouseReferenceService as unknown as WarehouseReferenceService,
    );
  });

  describe('create', () => {
    it('ném ConflictException khi invoicePrefix đã tồn tại trong Organization', async () => {
      branchRepository.existsByInvoicePrefix.mockResolvedValue(true);
      await expect(
        service.create({ name: 'HN', invoicePrefix: 'HN' }, actor),
      ).rejects.toThrow(ConflictException);
      expect(codeGenerator.generate).not.toHaveBeenCalled();
    });

    it('tạo thành công', async () => {
      branchRepository.existsByInvoicePrefix.mockResolvedValue(false);
      codeGenerator.generate.mockResolvedValue('BR000001');
      branchRepository.create.mockResolvedValue(branch);

      const result = await service.create(
        { name: 'Chi nhánh HN', invoicePrefix: 'HN' },
        actor,
      );

      expect(branchRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          code: 'BR000001',
          createdBy: 'user-1',
        }),
      );
      expect(result.code).toBe('BR000001');
    });
  });

  describe('getById', () => {
    it('ném NotFoundException khi không tìm thấy', async () => {
      branchRepository.findById.mockResolvedValue(null);
      await expect(service.getById('branch-x', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('trả về DTO khi tìm thấy', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      const result = await service.getById('branch-1', actor);
      expect(result.code).toBe('BR000001');
    });
  });

  describe('search', () => {
    it('trả về danh sách phân trang theo đúng organizationId', async () => {
      branchRepository.search.mockResolvedValue({
        items: [branch],
        total: 1,
        page: 1,
        limit: 20,
      });
      const result = await service.search({}, actor);
      expect(branchRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
      expect(result.total).toBe(1);
    });
  });

  describe('update', () => {
    it('ném NotFoundException khi branch không tồn tại/khác tổ chức', async () => {
      branchRepository.findById.mockResolvedValue(null);
      await expect(
        service.update('branch-1', { name: 'X' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(branchRepository.update).not.toHaveBeenCalled();
    });

    it('cập nhật thành công', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.update.mockResolvedValue({ ...branch, name: 'HN 2' });
      const result = await service.update('branch-1', { name: 'HN 2' }, actor);
      expect(result.name).toBe('HN 2');
    });

    it('map BranchInvoicePrefixConflictError -> ConflictException', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.update.mockRejectedValue(
        new BranchInvoicePrefixConflictError('HCM'),
      );
      await expect(
        service.update('branch-1', { invoicePrefix: 'HCM' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('archive', () => {
    it('ném NotFoundException khi branch không tồn tại', async () => {
      branchRepository.findById.mockResolvedValue(null);
      await expect(service.archive('branch-1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('archive thành công', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.archive.mockResolvedValue({
        ...branch,
        status: 'ARCHIVED',
      });
      const result = await service.archive('branch-1', actor);
      expect(result.status).toBe('ARCHIVED');
    });

    it('map BranchHasActiveWarehouseError -> ConflictException', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.archive.mockRejectedValue(
        new BranchHasActiveWarehouseError('branch-1'),
      );
      await expect(service.archive('branch-1', actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('map BranchOrganizationMinOneActiveError -> ConflictException', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.archive.mockRejectedValue(
        new BranchOrganizationMinOneActiveError('org-1'),
      );
      await expect(service.archive('branch-1', actor)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('setDefault', () => {
    it('ném NotFoundException khi branch không tồn tại', async () => {
      branchRepository.findById.mockResolvedValue(null);
      await expect(service.setDefault('branch-1', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('set default thành công', async () => {
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.setDefault.mockResolvedValue({
        ...branch,
        isMain: true,
      });
      const result = await service.setDefault('branch-1', actor);
      expect(result.isMain).toBe(true);
    });
  });

  // T053.05C-2 — B-U1..B-U10: managerUserId (CreateBranchDto/UpdateBranchDto) và
  // defaultWarehouseId (UpdateBranchDto) là foreign id tenant-owned (User/Warehouse). Mọi rejection
  // phải chứng minh: (a) đúng canonical error contract (USER_NOT_FOUND/WAREHOUSE_NOT_FOUND — không
  // mã lỗi mới, không 403), (b) branchRepository.create()/update() KHÔNG được gọi.
  describe('T053.05C-2 — managerUserId / defaultWarehouseId tenant-isolation', () => {
    beforeEach(() => {
      branchRepository.existsByInvoicePrefix.mockResolvedValue(false);
      codeGenerator.generate.mockResolvedValue('BR000001');
      branchRepository.create.mockResolvedValue(branch);
      branchRepository.findById.mockResolvedValue(branch);
      branchRepository.update.mockResolvedValue(branch);
    });

    it('B-U1: create — managerUserId undefined → KHÔNG tra User, tạo thành công', async () => {
      await service.create({ name: 'HN', invoicePrefix: 'HN' }, actor);
      expect(userReferenceService.findById).not.toHaveBeenCalled();
      expect(branchRepository.create).toHaveBeenCalled();
    });

    it('B-U2: create — managerUserId cùng tổ chức → tra User, tạo thành công', async () => {
      userReferenceService.findById.mockResolvedValue(user);
      await service.create(
        { name: 'HN', invoicePrefix: 'HN', managerUserId: 'user-2' },
        actor,
      );
      expect(userReferenceService.findById).toHaveBeenCalledWith(
        'user-2',
        'org-1',
      );
      expect(branchRepository.create).toHaveBeenCalled();
    });

    it('B-U3: create — managerUserId khác tổ chức/không tồn tại → NotFoundException(USER_NOT_FOUND), KHÔNG gọi create()', async () => {
      userReferenceService.findById.mockResolvedValue(null);
      const promise = service.create(
        { name: 'HN', invoicePrefix: 'HN', managerUserId: 'user-x' },
        actor,
      );
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'USER_001' },
      });
      expect(branchRepository.create).not.toHaveBeenCalled();
    });

    it('B-U4: update — managerUserId undefined → KHÔNG tra User, giữ nguyên giá trị hiện có', async () => {
      await service.update('branch-1', { name: 'X' }, actor);
      expect(userReferenceService.findById).not.toHaveBeenCalled();
      expect(branchRepository.update).toHaveBeenCalled();
      // undefined = key hoàn toàn vắng mặt trong input truyền cho repository (Prisma coi thiếu key
      // là "không đổi" — KHÔNG giống truyền managerUserId: undefined tường minh, dù giá trị runtime
      // như nhau, để không nhầm với B-U5 (null tường minh = xoá)).
      const updateInput = branchRepository.update.mock.calls[0][2];
      expect(updateInput).not.toHaveProperty('managerUserId');
    });

    it('B-U5: update — managerUserId null → KHÔNG tra User, xoá giá trị (repository nhận null)', async () => {
      await service.update('branch-1', { managerUserId: null as never }, actor);
      expect(userReferenceService.findById).not.toHaveBeenCalled();
      expect(branchRepository.update).toHaveBeenCalledWith(
        'branch-1',
        'org-1',
        expect.objectContaining({ managerUserId: null }),
      );
    });

    it('B-U6: update — managerUserId cùng tổ chức → tra User, cập nhật thành công', async () => {
      userReferenceService.findById.mockResolvedValue(user);
      await service.update('branch-1', { managerUserId: 'user-2' }, actor);
      expect(userReferenceService.findById).toHaveBeenCalledWith(
        'user-2',
        'org-1',
      );
      expect(branchRepository.update).toHaveBeenCalled();
    });

    it('B-U7: update — managerUserId khác tổ chức/không tồn tại → NotFoundException(USER_NOT_FOUND), KHÔNG gọi update()', async () => {
      userReferenceService.findById.mockResolvedValue(null);
      const promise = service.update(
        'branch-1',
        { managerUserId: 'user-x' },
        actor,
      );
      await expect(promise).rejects.toThrow(NotFoundException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'USER_001' },
      });
      expect(branchRepository.update).not.toHaveBeenCalled();
    });

    it('B-U8: update — defaultWarehouseId undefined → KHÔNG tra Warehouse, giữ nguyên giá trị hiện có', async () => {
      await service.update('branch-1', { name: 'X' }, actor);
      expect(warehouseReferenceService.findById).not.toHaveBeenCalled();
      expect(branchRepository.update).toHaveBeenCalled();
      const updateInput = branchRepository.update.mock.calls[0][2];
      expect(updateInput).not.toHaveProperty('defaultWarehouseId');
    });

    it('B-U9: update — defaultWarehouseId null → KHÔNG tra Warehouse, xoá giá trị (repository nhận null)', async () => {
      await service.update(
        'branch-1',
        { defaultWarehouseId: null as never },
        actor,
      );
      expect(warehouseReferenceService.findById).not.toHaveBeenCalled();
      expect(branchRepository.update).toHaveBeenCalledWith(
        'branch-1',
        'org-1',
        expect.objectContaining({ defaultWarehouseId: null }),
      );
    });

    it('B-U10: update — defaultWarehouseId cùng tổ chức → cập nhật thành công; khác tổ chức/không tồn tại → NotFoundException(WAREHOUSE_NOT_FOUND), KHÔNG gọi update()', async () => {
      warehouseReferenceService.findById.mockResolvedValue(warehouse);
      await service.update(
        'branch-1',
        { defaultWarehouseId: 'warehouse-1' },
        actor,
      );
      expect(warehouseReferenceService.findById).toHaveBeenCalledWith(
        'warehouse-1',
        'org-1',
      );
      expect(branchRepository.update).toHaveBeenCalled();

      branchRepository.update.mockClear();
      warehouseReferenceService.findById.mockResolvedValue(null);
      const rejectedPromise = service.update(
        'branch-1',
        { defaultWarehouseId: 'warehouse-x' },
        actor,
      );
      await expect(rejectedPromise).rejects.toThrow(NotFoundException);
      await expect(rejectedPromise).rejects.toMatchObject({
        response: { errorCode: 'WAREHOUSE_001' },
      });
      expect(branchRepository.update).not.toHaveBeenCalled();
    });
  });
});
