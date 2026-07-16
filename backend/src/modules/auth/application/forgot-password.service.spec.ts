import { BadRequestException, HttpException } from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { AuthUserEntity } from '../domain/entities/auth-user.entity';
import { IAuthUserRepository } from '../domain/repositories/auth-user.repository.interface';
import { ISessionRepository } from '../domain/repositories/session.repository.interface';
import { IOtpRepository } from '../domain/repositories/otp.repository.interface';
import { IPasswordHasher } from '../domain/services/password-hasher.interface';
import { MailService } from '../infrastructure/mail/mail.service';
import { TokenService } from '../infrastructure/security/token.service';
import { ForgotPasswordService } from './forgot-password.service';

describe('ForgotPasswordService', () => {
  let service: ForgotPasswordService;
  let userRepository: jest.Mocked<IAuthUserRepository>;
  let sessionRepository: jest.Mocked<ISessionRepository>;
  let otpRepository: jest.Mocked<IOtpRepository>;
  let passwordHasher: jest.Mocked<IPasswordHasher>;
  let tokenService: jest.Mocked<Pick<TokenService, 'hashOtp'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendOtpEmail'>>;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'log'>>;

  const organizationSlug = 'kiotviet-off';
  const email = 'owner@kiotviet-off.vn';
  const identifier = `${organizationSlug}:${email}`;
  const user: AuthUserEntity = {
    id: 'user-1',
    organizationId: 'org-1',
    branchId: null,
    email,
    username: 'owner',
    passwordHash: 'old-hash',
    status: 'ACTIVE',
    permissionVersion: 1,
    isPlatformAdmin: false,
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
    otpRepository = {
      save: jest.fn(),
      get: jest.fn(),
      incrementAttempts: jest.fn(),
      delete: jest.fn(),
      incrementSendCount: jest.fn(),
      markVerified: jest.fn(),
      isVerified: jest.fn(),
      getCooldownRemainingSeconds: jest.fn().mockResolvedValue(0),
      startCooldown: jest.fn(),
    };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    tokenService = { hashOtp: jest.fn().mockReturnValue('hashed-otp') };
    mailService = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ForgotPasswordService(
      userRepository,
      sessionRepository,
      otpRepository,
      passwordHasher,
      tokenService as unknown as TokenService,
      mailService as unknown as MailService,
      auditLogService as unknown as AuditLogService,
    );
  });

  describe('requestOtp', () => {
    it('gửi OTP khi email tồn tại, không cooldown và chưa vượt rate limit', async () => {
      otpRepository.incrementSendCount.mockResolvedValue(1);
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);

      await service.requestOtp(organizationSlug, email);

      expect(otpRepository.save).toHaveBeenCalledWith(identifier, 'hashed-otp');
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith(
        email,
        expect.any(String),
      );
      expect(otpRepository.startCooldown).toHaveBeenCalledWith(identifier);
    });

    it('không tiết lộ và không gửi mail khi email không tồn tại (chống dò email)', async () => {
      otpRepository.incrementSendCount.mockResolvedValue(1);
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(null);

      await expect(
        service.requestOtp(organizationSlug, 'unknown@x.com'),
      ).resolves.toBeUndefined();
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('chặn khi đang trong thời gian cooldown 60s', async () => {
      otpRepository.getCooldownRemainingSeconds.mockResolvedValue(42);

      await expect(service.requestOtp(organizationSlug, email)).rejects.toThrow(
        HttpException,
      );
      expect(otpRepository.incrementSendCount).not.toHaveBeenCalled();
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('chặn khi vượt quá 5 lần gửi OTP trong 1 giờ', async () => {
      otpRepository.incrementSendCount.mockResolvedValue(6);

      await expect(service.requestOtp(organizationSlug, email)).rejects.toThrow(
        HttpException,
      );
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('đánh dấu verified khi OTP đúng', async () => {
      otpRepository.get.mockResolvedValue({
        otpHash: 'hashed-otp',
        attempts: 0,
      });

      await service.verifyOtp(organizationSlug, email, '123456');

      expect(otpRepository.markVerified).toHaveBeenCalledWith(identifier);
    });

    it('ném lỗi khi OTP đã hết hạn / không tồn tại', async () => {
      otpRepository.get.mockResolvedValue(null);

      await expect(
        service.verifyOtp(organizationSlug, email, '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('ném lỗi và tăng attempts khi OTP sai', async () => {
      otpRepository.get.mockResolvedValue({
        otpHash: 'other-hash',
        attempts: 0,
      });

      await expect(
        service.verifyOtp(organizationSlug, email, '000000'),
      ).rejects.toThrow(BadRequestException);
      expect(otpRepository.incrementAttempts).toHaveBeenCalledWith(identifier);
      expect(otpRepository.markVerified).not.toHaveBeenCalled();
    });

    it('xóa OTP và từ chối khi vượt quá số lần thử', async () => {
      otpRepository.get.mockResolvedValue({
        otpHash: 'hashed-otp',
        attempts: 5,
      });

      await expect(
        service.verifyOtp(organizationSlug, email, '123456'),
      ).rejects.toThrow(BadRequestException);
      expect(otpRepository.delete).toHaveBeenCalledWith(identifier);
    });
  });

  describe('resetPassword', () => {
    it('đặt lại mật khẩu thành công khi OTP đã verified, thu hồi mọi session', async () => {
      otpRepository.isVerified.mockResolvedValue(true);
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.hash.mockResolvedValue('new-hash');

      await service.resetPassword(organizationSlug, email, 'NewP@ssw0rd123');

      expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
        user.id,
        'new-hash',
      );
      expect(otpRepository.delete).toHaveBeenCalledWith(identifier);
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(user.id);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('từ chối nếu chưa xác thực OTP', async () => {
      otpRepository.isVerified.mockResolvedValue(false);

      await expect(
        service.resetPassword(organizationSlug, email, 'NewP@ssw0rd123'),
      ).rejects.toThrow(BadRequestException);
      expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
    });
  });
});
