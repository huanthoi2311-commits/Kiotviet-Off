import { UnauthorizedException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { RbacService } from '../../rbac/application/rbac.service';
import { AuthUserEntity } from '../domain/entities/auth-user.entity';
import { SessionEntity } from '../domain/entities/session.entity';
import { IAuthUserRepository } from '../domain/repositories/auth-user.repository.interface';
import { ISessionRepository } from '../domain/repositories/session.repository.interface';
import { IDeviceInfoResolver } from '../domain/services/device-info-resolver.interface';
import { IPasswordHasher } from '../domain/services/password-hasher.interface';
import { DeviceContext } from '../domain/value-objects/device-context';
import { TokenService } from '../infrastructure/security/token.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<IAuthUserRepository>;
  let sessionRepository: jest.Mocked<ISessionRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;
  let deviceInfoResolver: jest.Mocked<IDeviceInfoResolver>;
  let tokenService: jest.Mocked<
    Pick<
      TokenService,
      'signAccessToken' | 'generateRefreshToken' | 'hashRefreshToken'
    >
  >;
  let rbacService: { getPermissionCodesForUser: jest.Mock };
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const device: DeviceContext = {
    userAgent: 'jest',
    ip: '127.0.0.1',
    clientType: 'WEB',
  };
  const organizationSlug = 'kiotviet-off';

  const user: AuthUserEntity = {
    id: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    email: 'owner@kiotviet-off.vn',
    username: 'owner',
    passwordHash: 'hashed',
    status: 'ACTIVE',
    permissionVersion: 3,
    isPlatformAdmin: false,
  };

  const sessionRow: SessionEntity = {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash-of-raw',
    deviceName: null,
    browser: 'Chrome 120',
    os: 'Windows 11',
    clientType: 'WEB',
    ip: '127.0.0.1',
    country: null,
    city: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    lastActivityAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    userRepository = {
      findByOrganizationSlugAndEmail: jest.fn(),
      findById: jest.fn(),
      updatePasswordHash: jest.fn(),
      updateLastLoginAt: jest.fn(),
    };
    sessionRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      findById: jest.fn(),
      listActiveForUser: jest.fn(),
      revokeById: jest.fn(),
      revokeAllForUser: jest.fn(),
      touchActivity: jest.fn(),
    };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    deviceInfoResolver = {
      resolve: jest.fn().mockReturnValue({
        browser: 'Chrome 120',
        os: 'Windows 11',
        country: null,
        city: null,
      }),
    };
    tokenService = {
      signAccessToken: jest.fn().mockReturnValue('signed-access-token'),
      generateRefreshToken: jest.fn().mockReturnValue({
        raw: 'raw-refresh-token',
        hash: 'hash-of-raw',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      hashRefreshToken: jest.fn().mockReturnValue('hash-of-raw'),
    };
    rbacService = {
      getPermissionCodesForUser: jest.fn().mockResolvedValue(['product:view']),
    };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      userRepository,
      sessionRepository,
      passwordHasher,
      deviceInfoResolver,
      tokenService as unknown as TokenService,
      rbacService as unknown as RbacService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('login', () => {
    it('đăng nhập thành công trả về accessToken, refreshToken và userInfo', async () => {
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(true);
      sessionRepository.create.mockResolvedValue(sessionRow);

      const issued = await service.login(
        organizationSlug,
        user.email,
        'P@ssw0rd123',
        device,
      );

      expect(issued.response.accessToken).toBe('signed-access-token');
      expect(issued.response.refreshToken).toBe('raw-refresh-token');
      expect(issued.response.userInfo.email).toBe(user.email);
      expect(issued.response.userInfo.permissions).toEqual(['product:view']);
      expect(userRepository.updateLastLoginAt).toHaveBeenCalledWith(user.id);
      expect(sessionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          refreshTokenHash: 'hash-of-raw',
        }),
      );
    });

    it('nhúng permissionVersion hiện tại của user vào access token payload', async () => {
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(true);
      sessionRepository.create.mockResolvedValue(sessionRow);

      await service.login(organizationSlug, user.email, 'P@ssw0rd123', device);

      expect(tokenService.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ permissionVersion: 3 }),
      );
    });

    it('ném UnauthorizedException khi không tìm thấy user theo organizationSlug', async () => {
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(null);

      await expect(
        service.login(organizationSlug, 'unknown@x.com', 'P@ssw0rd123', device),
      ).rejects.toThrow(UnauthorizedException);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('ném UnauthorizedException khi sai mật khẩu', async () => {
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(false);

      await expect(
        service.login(organizationSlug, user.email, 'wrong-password', device),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.create).not.toHaveBeenCalled();
    });

    it('ném UnauthorizedException khi tài khoản không ACTIVE', async () => {
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue({
        ...user,
        status: 'LOCKED',
      });

      await expect(
        service.login(organizationSlug, user.email, 'P@ssw0rd123', device),
      ).rejects.toThrow(UnauthorizedException);
      expect(passwordHasher.verify).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('xoay vòng refresh token thành công (thu hồi session cũ, cấp session mới)', async () => {
      sessionRepository.findByTokenHash.mockResolvedValue(sessionRow);
      userRepository.findById.mockResolvedValue(user);
      sessionRepository.create.mockResolvedValue(sessionRow);

      const issued = await service.refreshToken('raw-refresh-token', device);

      expect(sessionRepository.revokeById).toHaveBeenCalledWith(sessionRow.id);
      expect(issued.response.accessToken).toBe('signed-access-token');
      expect(issued.response.refreshToken).toBe('raw-refresh-token');
    });

    it('ném UnauthorizedException khi refresh token không tồn tại', async () => {
      sessionRepository.findByTokenHash.mockResolvedValue(null);

      await expect(service.refreshToken('bogus', device)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('thu hồi toàn bộ session khi phát hiện refresh token đã bị revoke bị dùng lại', async () => {
      sessionRepository.findByTokenHash.mockResolvedValue({
        ...sessionRow,
        revokedAt: new Date(),
      });

      await expect(
        service.refreshToken('raw-refresh-token', device),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(user.id);
    });

    it('ném UnauthorizedException khi refresh token đã hết hạn', async () => {
      sessionRepository.findByTokenHash.mockResolvedValue({
        ...sessionRow,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.refreshToken('raw-refresh-token', device),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('chỉ thu hồi session của thiết bị hiện tại', async () => {
      sessionRepository.findByTokenHash.mockResolvedValue(sessionRow);

      await service.logout('raw-refresh-token', user.id);

      expect(sessionRepository.revokeById).toHaveBeenCalledWith(sessionRow.id);
      expect(sessionRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('không thu hồi nếu session thuộc user khác', async () => {
      sessionRepository.findByTokenHash.mockResolvedValue({
        ...sessionRow,
        userId: 'someone-else',
      });

      await service.logout('raw-refresh-token', user.id);

      expect(sessionRepository.revokeById).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('thu hồi toàn bộ session của user', async () => {
      await service.logoutAll(user.id);
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(user.id);
    });
  });

  describe('listSessions / revokeSession', () => {
    it('liệt kê session đang hoạt động của user', async () => {
      sessionRepository.listActiveForUser.mockResolvedValue([sessionRow]);
      const result = await service.listSessions(user.id);
      expect(result).toEqual([sessionRow]);
    });

    it('chỉ thu hồi session nếu thuộc đúng user', async () => {
      sessionRepository.findById.mockResolvedValue(sessionRow);
      await service.revokeSession(user.id, sessionRow.id);
      expect(sessionRepository.revokeById).toHaveBeenCalledWith(sessionRow.id);
    });

    it('bỏ qua nếu session thuộc user khác', async () => {
      sessionRepository.findById.mockResolvedValue({
        ...sessionRow,
        userId: 'someone-else',
      });
      await service.revokeSession(user.id, sessionRow.id);
      expect(sessionRepository.revokeById).not.toHaveBeenCalled();
    });
  });
});
