import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { IRoleRepository } from '../domain/repositories/role.repository.interface';
import { IPermissionRepository } from '../domain/repositories/permission.repository.interface';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  let service: RbacService;
  let roleRepository: jest.Mocked<IRoleRepository>;
  let permissionRepository: jest.Mocked<IPermissionRepository>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  beforeEach(() => {
    roleRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCode: jest.fn(),
      list: jest.fn(),
      replacePermissions: jest.fn(),
      assignRoleToUser: jest.fn(),
      removeRoleFromUser: jest.fn(),
      getRoleCodesForUser: jest.fn(),
      getPermissionCodesForUser: jest.fn(),
      incrementPermissionVersionForUser: jest.fn(),
      incrementPermissionVersionForUsersWithRole: jest.fn(),
    };
    permissionRepository = { list: jest.fn(), findByCodes: jest.fn() };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new RbacService(
      roleRepository,
      permissionRepository,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('createRole', () => {
    it('tạo role mới khi code chưa tồn tại', async () => {
      roleRepository.findByCode.mockResolvedValue(null);
      roleRepository.create.mockResolvedValue({
        id: 'role-1',
        organizationId: 'org-1',
        code: 'sales_staff',
        name: 'Nhân viên bán hàng',
        isSystem: false,
        description: null,
      });

      const result = await service.createRole('org-1', {
        code: 'sales_staff',
        name: 'Nhân viên bán hàng',
      });

      expect(result.code).toBe('sales_staff');
      expect(roleRepository.create).toHaveBeenCalled();
    });

    it('ném ConflictException khi code đã tồn tại', async () => {
      roleRepository.findByCode.mockResolvedValue({
        id: 'role-1',
        organizationId: 'org-1',
        code: 'sales_staff',
        name: 'x',
        isSystem: false,
        description: null,
      });

      await expect(
        service.createRole('org-1', {
          code: 'sales_staff',
          name: 'Nhân viên bán hàng',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('assignPermissions', () => {
    const role = {
      id: 'role-1',
      organizationId: 'org-1',
      code: 'sales_staff',
      name: 'Nhân viên bán hàng',
      isSystem: false,
      description: null,
      permissionCodes: ['product:view', 'customer:view'],
    };

    it('gán permission hợp lệ, tăng permissionVersion cho user giữ role và ghi audit log', async () => {
      roleRepository.findById.mockResolvedValue(role);
      permissionRepository.findByCodes.mockResolvedValue([
        { id: 'p1', code: 'product:view', group: 'product', description: null },
        {
          id: 'p2',
          code: 'customer:view',
          group: 'customer',
          description: null,
        },
      ]);

      const result = await service.assignPermissions(
        'role-1',
        ['product:view', 'customer:view'],
        { userId: 'admin-1', organizationId: 'org-1' },
      );

      expect(roleRepository.replacePermissions).toHaveBeenCalledWith('role-1', [
        'p1',
        'p2',
      ]);
      expect(
        roleRepository.incrementPermissionVersionForUsersWithRole,
      ).toHaveBeenCalledWith('role-1');
      expect(result.permissionCodes).toEqual(['product:view', 'customer:view']);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'role.permissions.update',
          entityId: 'role-1',
        }),
      );
    });

    it('không ghi audit log khi không truyền actor', async () => {
      roleRepository.findById.mockResolvedValue(role);
      permissionRepository.findByCodes.mockResolvedValue([
        { id: 'p1', code: 'product:view', group: 'product', description: null },
        {
          id: 'p2',
          code: 'customer:view',
          group: 'customer',
          description: null,
        },
      ]);

      await service.assignPermissions('role-1', [
        'product:view',
        'customer:view',
      ]);

      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi role không tồn tại', async () => {
      roleRepository.findById.mockResolvedValue(null);

      await expect(
        service.assignPermissions('missing', ['product:view']),
      ).rejects.toThrow(NotFoundException);
    });

    it('ném NotFoundException khi có permission code không hợp lệ', async () => {
      roleRepository.findById.mockResolvedValue(role);
      permissionRepository.findByCodes.mockResolvedValue([
        { id: 'p1', code: 'product:view', group: 'product', description: null },
      ]);

      await expect(
        service.assignPermissions('role-1', [
          'product:view',
          'not-a-real-permission',
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPermissionCodesForUser', () => {
    it('trả về danh sách permission code của user', async () => {
      roleRepository.getPermissionCodesForUser.mockResolvedValue([
        'product:view',
      ]);

      const result = await service.getPermissionCodesForUser('user-1');

      expect(result).toEqual(['product:view']);
    });
  });
});
