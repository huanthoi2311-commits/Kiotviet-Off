import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { AuthService } from '../../auth/application/auth.service';
import type { IPasswordHasher } from '../../auth/domain/services/password-hasher.interface';
import { BranchService } from '../../branch/application/branch.service';
import type { IOrganizationRepository } from '../../organization/domain/repositories/organization.repository.interface';
import { RbacService } from '../../rbac/application/rbac.service';
import { UserEntity } from '../domain/entities/user.entity';
import {
  IUserRepository,
  UserEmailConflictError,
  UserUsernameConflictError,
} from '../domain/repositories/user.repository.interface';
import { ActorContext, UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<IUserRepository>;
  let passwordHasher: jest.Mocked<Pick<IPasswordHasher, 'hash' | 'verify'>>;
  let organizationRepository: jest.Mocked<
    Pick<IOrganizationRepository, 'findById'>
  >;
  let branchService: jest.Mocked<Pick<BranchService, 'getById'>>;
  let authService: jest.Mocked<Pick<AuthService, 'revokeAllSessionsForUser'>>;
  let rbacService: jest.Mocked<Pick<RbacService, 'getRoleCodesForUser'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const actor: ActorContext = { userId: 'admin-1', organizationId: 'org-1' };

  const makeUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
    id: 'user-1',
    organizationId: 'org-1',
    branchId: null,
    username: 'staff01',
    fullName: 'Nhân viên 01',
    email: 'staff01@acme.test',
    phone: null,
    avatar: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

  beforeEach(() => {
    userRepository = {
      findById: jest.fn(),
      search: jest.fn(),
      existsByUsername: jest.fn().mockResolvedValue(false),
      existsByEmail: jest.fn().mockResolvedValue(false),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      updatePasswordHash: jest.fn(),
    };
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      verify: jest.fn(),
    };
    organizationRepository = {
      findById: jest.fn().mockResolvedValue({
        organization: { ownerUserId: 'owner-1' },
        settings: {},
        subscription: {},
      }),
    };
    branchService = { getById: jest.fn().mockResolvedValue(undefined) };
    authService = {
      revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined),
    };
    rbacService = { getRoleCodesForUser: jest.fn().mockResolvedValue([]) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new UserService(
      userRepository,
      passwordHasher,
      organizationRepository as unknown as IOrganizationRepository,
      branchService as unknown as BranchService,
      authService as unknown as AuthService,
      rbacService as unknown as RbacService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('search', () => {
    it('luôn scope theo organizationId của actor', async () => {
      userRepository.search.mockResolvedValue({
        items: [makeUser()],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await service.search({}, 'org-1');

      expect(result.total).toBe(1);
      expect(userRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });
  });

  describe('findOne', () => {
    it('trả về chi tiết kèm role codes khi user thuộc đúng tổ chức', async () => {
      userRepository.findById.mockResolvedValue(makeUser());
      rbacService.getRoleCodesForUser.mockResolvedValue(['owner']);

      const result = await service.findOne('user-1', 'org-1');

      expect(userRepository.findById).toHaveBeenCalledWith('user-1', 'org-1');
      expect(rbacService.getRoleCodesForUser).toHaveBeenCalledWith(
        'user-1',
        'org-1',
      );
      expect(result.roleCodes).toEqual(['owner']);
      expect(
        (result as unknown as { passwordHash?: string }).passwordHash,
      ).toBeUndefined();
    });

    it('ném NotFoundException khi user thuộc tổ chức khác hoặc không tồn tại', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.findOne('user-of-other-org', 'org-1'),
      ).rejects.toThrow(NotFoundException);
      expect(rbacService.getRoleCodesForUser).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto = {
      username: 'staff02',
      email: 'staff02@acme.test',
      password: 'Password123',
    };

    it('hash mật khẩu qua PASSWORD_HASHER trước khi lưu, không lưu plaintext', async () => {
      userRepository.create.mockResolvedValue(makeUser({ id: 'user-2' }));

      await service.create(dto, actor);

      expect(passwordHasher.hash).toHaveBeenCalledWith('Password123');
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          username: 'staff02',
          email: 'staff02@acme.test',
          passwordHash: 'hashed-password',
        }),
      );
      const createCall = userRepository.create.mock.calls[0][0];
      expect(createCall).not.toHaveProperty('password');
    });

    it('ném ConflictException khi username đã tồn tại trong tổ chức (pre-check), không tạo user', async () => {
      userRepository.existsByUsername.mockResolvedValue(true);

      await expect(service.create(dto, actor)).rejects.toThrow(
        ConflictException,
      );
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('ném ConflictException khi email đã tồn tại trong tổ chức (pre-check), không tạo user', async () => {
      userRepository.existsByEmail.mockResolvedValue(true);

      await expect(service.create(dto, actor)).rejects.toThrow(
        ConflictException,
      );
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('race-safe: pre-check qua nhưng DB unique constraint (P2002) vẫn chặn — map sang ConflictException', async () => {
      userRepository.create.mockRejectedValue(
        new UserUsernameConflictError('staff02'),
      );

      await expect(service.create(dto, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('race-safe: UserEmailConflictError từ repository cũng map sang ConflictException', async () => {
      userRepository.create.mockRejectedValue(
        new UserEmailConflictError('staff02@acme.test'),
      );

      await expect(service.create(dto, actor)).rejects.toThrow(
        ConflictException,
      );
    });

    it('xác minh branchId thuộc tổ chức actor TRƯỚC khi tạo user, khi branchId được cung cấp', async () => {
      userRepository.create.mockResolvedValue(makeUser({ id: 'user-2' }));

      await service.create({ ...dto, branchId: 'branch-1' }, actor);

      expect(branchService.getById).toHaveBeenCalledWith('branch-1', {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
    });

    it('branchId thuộc tổ chức khác/không tồn tại bị từ chối, không tạo user', async () => {
      branchService.getById.mockRejectedValue(new NotFoundException());

      await expect(
        service.create({ ...dto, branchId: 'branch-of-other-org' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.create).not.toHaveBeenCalled();
    });

    it('không gọi branchService.getById khi branchId không được cung cấp', async () => {
      userRepository.create.mockResolvedValue(makeUser({ id: 'user-2' }));

      await service.create(dto, actor);

      expect(branchService.getById).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('chỉ ghi đúng 4 field cho phép (fullName/phone/avatar/branchId), không có organizationId/username/email/status', async () => {
      userRepository.findById.mockResolvedValue(makeUser());
      userRepository.update.mockResolvedValue(makeUser({ fullName: 'Mới' }));

      await service.update(
        'user-1',
        { fullName: 'Mới', phone: '0900000000' },
        actor,
      );

      expect(userRepository.update).toHaveBeenCalledWith('user-1', 'org-1', {
        branchId: undefined,
        fullName: 'Mới',
        phone: '0900000000',
        avatar: undefined,
        updatedBy: 'admin-1',
      });
    });

    it('ném NotFoundException khi user thuộc tổ chức khác hoặc không tồn tại', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('user-of-other-org', { fullName: 'x' }, actor),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.update).not.toHaveBeenCalled();
    });

    it('xác minh branchId tenant-owned khi được cung cấp trong update', async () => {
      userRepository.findById.mockResolvedValue(makeUser());
      userRepository.update.mockResolvedValue(makeUser());

      await service.update('user-1', { branchId: 'branch-1' }, actor);

      expect(branchService.getById).toHaveBeenCalledWith('branch-1', {
        userId: actor.userId,
        organizationId: actor.organizationId,
      });
    });
  });

  describe('deactivate (D1/D2)', () => {
    it('chuyển ACTIVE → INACTIVE, thu hồi toàn bộ session của target, ghi audit log', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ id: 'user-2' }));
      userRepository.updateStatus.mockResolvedValue(
        makeUser({ id: 'user-2', status: 'INACTIVE' }),
      );

      const result = await service.deactivate('user-2', actor);

      expect(userRepository.updateStatus).toHaveBeenCalledWith(
        'user-2',
        'org-1',
        'INACTIVE',
        'admin-1',
      );
      expect(authService.revokeAllSessionsForUser).toHaveBeenCalledWith(
        'user-2',
      );
      expect(result.status).toBe('INACTIVE');
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user.deactivate' }),
      );
    });

    it('D1 — tự vô hiệu hóa chính mình bị chặn, không ghi status, không thu hồi session', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ id: 'admin-1' }));

      await expect(service.deactivate('admin-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(userRepository.updateStatus).not.toHaveBeenCalled();
      expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    });

    it('D1 — vô hiệu hóa Organization.ownerUserId bị chặn, không ghi status', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ id: 'owner-1' }));

      await expect(service.deactivate('owner-1', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(userRepository.updateStatus).not.toHaveBeenCalled();
      expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi target thuộc tổ chức khác hoặc không tồn tại (không tiết lộ cross-tenant)', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.deactivate('user-of-other-org', actor),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('ném UnprocessableEntityException khi target đã INACTIVE (invalid transition)', async () => {
      userRepository.findById.mockResolvedValue(
        makeUser({ id: 'user-2', status: 'INACTIVE' }),
      );

      await expect(service.deactivate('user-2', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(userRepository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('reactivate', () => {
    it('chuyển INACTIVE → ACTIVE, không đụng session', async () => {
      userRepository.findById.mockResolvedValue(
        makeUser({ id: 'user-2', status: 'INACTIVE' }),
      );
      userRepository.updateStatus.mockResolvedValue(
        makeUser({ id: 'user-2', status: 'ACTIVE' }),
      );

      const result = await service.reactivate('user-2', actor);

      expect(userRepository.updateStatus).toHaveBeenCalledWith(
        'user-2',
        'org-1',
        'ACTIVE',
        'admin-1',
      );
      expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(result.status).toBe('ACTIVE');
    });

    it('ném UnprocessableEntityException khi target đã ACTIVE (invalid transition)', async () => {
      userRepository.findById.mockResolvedValue(
        makeUser({ id: 'user-2', status: 'ACTIVE' }),
      );

      await expect(service.reactivate('user-2', actor)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(userRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('ném NotFoundException khi target thuộc tổ chức khác hoặc không tồn tại', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.reactivate('user-of-other-org', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPassword (D4)', () => {
    it('hash mật khẩu mới qua PASSWORD_HASHER, lưu hash, thu hồi toàn bộ session của target', async () => {
      userRepository.findById.mockResolvedValue(makeUser({ id: 'user-2' }));

      await service.resetPassword(
        'user-2',
        { newPassword: 'NewPassword123' },
        actor,
      );

      expect(passwordHasher.hash).toHaveBeenCalledWith('NewPassword123');
      expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
        'user-2',
        'org-1',
        'hashed-password',
        'admin-1',
      );
      expect(authService.revokeAllSessionsForUser).toHaveBeenCalledWith(
        'user-2',
      );
    });

    it('ném NotFoundException khi target thuộc tổ chức khác hoặc không tồn tại, không đổi mật khẩu', async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(
        service.resetPassword(
          'user-of-other-org',
          { newPassword: 'NewPassword123' },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
      expect(authService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    });
  });
});
