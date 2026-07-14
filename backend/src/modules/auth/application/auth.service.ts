import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { RbacService } from '../../rbac/application/rbac.service';
import { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { AuthUserEntity } from '../domain/entities/auth-user.entity';
import { SessionEntity } from '../domain/entities/session.entity';
import { DeviceContext } from '../domain/value-objects/device-context';
import { AUTH_USER_REPOSITORY } from '../domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from '../domain/repositories/auth-user.repository.interface';
import { SESSION_REPOSITORY } from '../domain/repositories/session.repository.interface';
import type { ISessionRepository } from '../domain/repositories/session.repository.interface';
import { DEVICE_INFO_RESOLVER } from '../domain/services/device-info-resolver.interface';
import type { IDeviceInfoResolver } from '../domain/services/device-info-resolver.interface';
import { PASSWORD_HASHER } from '../domain/services/password-hasher.interface';
import type { IPasswordHasher } from '../domain/services/password-hasher.interface';
import { TokenService } from '../infrastructure/security/token.service';
import { LoginResponseDto } from './dto/login-response.dto';

export interface IssuedSession {
  response: LoginResponseDto;
  refreshTokenExpiresAt: Date;
}

const INVALID_CREDENTIALS = withCode(
  ErrorCode.AUTH_INVALID_CREDENTIALS,
  'Email hoặc mật khẩu không đúng',
);

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_USER_REPOSITORY)
    private readonly userRepository: IAuthUserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    @Inject(DEVICE_INFO_RESOLVER)
    private readonly deviceInfoResolver: IDeviceInfoResolver,
    private readonly tokenService: TokenService,
    private readonly rbacService: RbacService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async login(
    organizationSlug: string,
    email: string,
    password: string,
    device: DeviceContext,
  ): Promise<IssuedSession> {
    const user = await this.userRepository.findByOrganizationSlugAndEmail(
      organizationSlug,
      email,
    );

    if (!user) {
      await this.auditLogService.log({
        organizationId: 'unknown',
        action: 'auth.login.failed',
        entityType: 'User',
        newValue: { organizationSlug, email, reason: 'user_not_found' },
        ip: device.ip,
        userAgent: device.userAgent,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status !== 'ACTIVE') {
      await this.auditLogService.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.login.failed',
        entityType: 'User',
        entityId: user.id,
        newValue: { reason: 'account_not_active', status: user.status },
        ip: device.ip,
        userAgent: device.userAgent,
      });
      throw new UnauthorizedException(
        withCode(
          ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE,
          'Tài khoản đang bị khóa hoặc ngừng hoạt động',
        ),
      );
    }

    const passwordMatches = await this.passwordHasher.verify(
      user.passwordHash,
      password,
    );
    if (!passwordMatches) {
      await this.auditLogService.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.login.failed',
        entityType: 'User',
        entityId: user.id,
        newValue: { reason: 'wrong_password' },
        ip: device.ip,
        userAgent: device.userAgent,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    await this.userRepository.updateLastLoginAt(user.id);
    const issued = await this.issueSession(user, device);

    await this.auditLogService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'auth.login.success',
      entityType: 'User',
      entityId: user.id,
      ip: device.ip,
      userAgent: device.userAgent,
    });

    return issued;
  }

  async refreshToken(
    rawRefreshToken: string,
    device: DeviceContext,
  ): Promise<IssuedSession> {
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const existing = await this.sessionRepository.findByTokenHash(tokenHash);

    if (!existing) {
      throw new UnauthorizedException(
        withCode(
          ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
          'Refresh token không hợp lệ',
        ),
      );
    }

    if (existing.revokedAt) {
      // Token đã bị thu hồi nhưng vẫn được dùng lại — nghi ngờ bị đánh cắp,
      // thu hồi toàn bộ session của user để chặn kẻ tấn công.
      await this.sessionRepository.revokeAllForUser(existing.userId);
      throw new UnauthorizedException(
        withCode(
          ErrorCode.AUTH_REFRESH_TOKEN_REUSED,
          'Refresh token đã bị thu hồi, vui lòng đăng nhập lại',
        ),
      );
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException(
        withCode(
          ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
          'Refresh token đã hết hạn',
        ),
      );
    }

    const user = await this.userRepository.findById(existing.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        withCode(ErrorCode.AUTH_ACCOUNT_NOT_ACTIVE, 'Tài khoản không khả dụng'),
      );
    }

    await this.sessionRepository.revokeById(existing.id);
    return this.issueSession(user, device, existing.deviceName);
  }

  async logout(rawRefreshToken: string, currentUserId: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const existing = await this.sessionRepository.findByTokenHash(tokenHash);
    if (!existing || existing.userId !== currentUserId || existing.revokedAt)
      return;
    await this.sessionRepository.revokeById(existing.id);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionRepository.revokeAllForUser(userId);
  }

  async listSessions(userId: string): Promise<SessionEntity[]> {
    return this.sessionRepository.listActiveForUser(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session || session.userId !== userId) return;
    await this.sessionRepository.revokeById(sessionId);
  }

  private async issueSession(
    user: AuthUserEntity,
    device: DeviceContext,
    deviceNameOverride?: string | null,
  ): Promise<IssuedSession> {
    const permissions = await this.rbacService.getPermissionCodesForUser(
      user.id,
    );

    const payload: JwtAccessPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      branchId: user.branchId,
      email: user.email,
      permissions,
      permissionVersion: user.permissionVersion,
    };
    const accessToken = this.tokenService.signAccessToken(payload);

    const { raw, hash, expiresAt } = this.tokenService.generateRefreshToken();
    const { browser, os, country, city } = this.deviceInfoResolver.resolve(
      device.userAgent,
      device.ip,
    );

    await this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash: hash,
      userAgent: device.userAgent,
      ip: device.ip,
      clientType: device.clientType,
      deviceName: device.deviceName ?? deviceNameOverride ?? null,
      browser,
      os,
      country,
      city,
      expiresAt,
    });

    return {
      response: {
        accessToken,
        refreshToken: raw,
        userInfo: {
          id: user.id,
          email: user.email,
          username: user.username,
          organizationId: user.organizationId,
          branchId: user.branchId,
          permissions,
        },
      },
      refreshTokenExpiresAt: expiresAt,
    };
  }
}
