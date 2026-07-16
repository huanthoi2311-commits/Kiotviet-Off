import { ConflictException, NotFoundException } from '@nestjs/common';
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

  const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1' };

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
    service = new BranchService(branchRepository, codeGenerator);
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
});
