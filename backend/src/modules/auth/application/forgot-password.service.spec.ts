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
  // T053.06B-2 (D5) — cùng mẫu hình mock `$transaction` đã dùng ở `checkout.service.spec.ts`: gọi
  // ngay callback với 1 `tx` giả (đối tượng rỗng) để mô phỏng hành vi thật của Prisma.
  let prisma: { $transaction: jest.Mock };

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
      verifyAndConsume: jest.fn(),
      incrementSendCount: jest.fn(),
      consumeVerified: jest.fn(),
      getCooldownRemainingSeconds: jest.fn().mockResolvedValue(0),
      startCooldown: jest.fn(),
      // T053.06B-1 — mặc định trả 1 (dưới ngưỡng throttle account-scoped mới) để không ảnh hưởng
      // các test verifyOtp/resetPassword hiện có không liên quan tới throttle này.
      incrementVerifyAttemptWindowCount: jest.fn().mockResolvedValue(1),
    };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    tokenService = { hashOtp: jest.fn().mockReturnValue('hashed-otp') };
    mailService = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };
    auditLogService = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({})),
    };

    service = new ForgotPasswordService(
      userRepository,
      sessionRepository,
      otpRepository,
      passwordHasher,
      tokenService as unknown as TokenService,
      mailService as unknown as MailService,
      auditLogService as unknown as AuditLogService,
      prisma as never,
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
        'PASSWORD_RESET',
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
    it('đánh dấu verified khi OTP đúng (outcome OK) — không còn gọi markVerified() riêng, Lua script tự xử lý', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({ outcome: 'OK' });

      await expect(
        service.verifyOtp(organizationSlug, email, '123456'),
      ).resolves.toBeUndefined();

      expect(otpRepository.verifyAndConsume).toHaveBeenCalledWith(
        identifier,
        'hashed-otp',
        5,
      );
    });

    it('ném lỗi OTP_INVALID_OR_EXPIRED khi outcome NOT_FOUND (OTP đã hết hạn / không tồn tại)', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({
        outcome: 'NOT_FOUND',
      });

      const promise = service.verifyOtp(organizationSlug, email, '123456');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'OTP_002' },
      });
    });

    it('ném lỗi OTP_INCORRECT khi outcome INCORRECT (OTP sai)', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({
        outcome: 'INCORRECT',
        attempts: 1,
      });

      const promise = service.verifyOtp(organizationSlug, email, '000000');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'OTP_003' },
      });
    });

    it('ném lỗi OTP_MAX_ATTEMPTS_EXCEEDED khi outcome MAX_ATTEMPTS (vượt quá số lần thử — Lua script đã tự xoá record)', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({
        outcome: 'MAX_ATTEMPTS',
      });

      const promise = service.verifyOtp(organizationSlug, email, '123456');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'OTP_004' },
      });
    });

    it('T053.06B-1 (§6) — throttle account-scoped: từ chối OTP_VERIFY_RATE_LIMIT_EXCEEDED khi vượt ngưỡng, KHÔNG gọi verifyAndConsume()', async () => {
      // Ngưỡng = MAX_OTP_SEND_PER_HOUR(5) * MAX_OTP_VERIFY_ATTEMPTS(5) = 25 — request thứ 26 bị chặn.
      otpRepository.incrementVerifyAttemptWindowCount.mockResolvedValue(26);

      const promise = service.verifyOtp(organizationSlug, email, '123456');
      await expect(promise).rejects.toThrow(HttpException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'OTP_008' },
      });
      expect(otpRepository.verifyAndConsume).not.toHaveBeenCalled();
    });

    it('T053.06B-1 (§6) — throttle account-scoped: ĐÚNG ngưỡng (25) vẫn cho qua, không throttle', async () => {
      otpRepository.incrementVerifyAttemptWindowCount.mockResolvedValue(25);
      otpRepository.verifyAndConsume.mockResolvedValue({ outcome: 'OK' });

      await expect(
        service.verifyOtp(organizationSlug, email, '123456'),
      ).resolves.toBeUndefined();
      expect(otpRepository.verifyAndConsume).toHaveBeenCalled();
    });

    it('T053.06B-1 (§6) — throttle account-scoped tính TRƯỚC bất kỳ bước nào khác, kể cả khi identifier chưa từng có OTP nào (không tạo oracle mới)', async () => {
      otpRepository.incrementVerifyAttemptWindowCount.mockResolvedValue(26);

      await expect(
        service.verifyOtp(organizationSlug, 'never-requested@x.com', '123456'),
      ).rejects.toThrow(HttpException);
      expect(
        otpRepository.incrementVerifyAttemptWindowCount,
      ).toHaveBeenCalledWith(`${organizationSlug}:never-requested@x.com`);
    });
  });

  describe('resetPassword — T053.06B-2 (D1/D3/D5)', () => {
    it('U5/U6 — đặt lại mật khẩu thành công khi consumeVerified() trả true: gọi tiêu thụ đúng 1 lần, thu hồi mọi session, ghi audit', async () => {
      otpRepository.consumeVerified.mockResolvedValue(true);
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.hash.mockResolvedValue('new-hash');

      await service.resetPassword(organizationSlug, email, 'NewP@ssw0rd123');

      expect(otpRepository.consumeVerified).toHaveBeenCalledWith(identifier);
      expect(otpRepository.consumeVerified).toHaveBeenCalledTimes(1);
      expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
        user.id,
        'new-hash',
        {},
      );
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(
        user.id,
        {},
      );
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('U5 — từ chối OTP_005 nếu consumeVerified() trả false (chưa xác thực hoặc đã bị tiêu thụ trước đó)', async () => {
      otpRepository.consumeVerified.mockResolvedValue(false);

      const promise = service.resetPassword(
        organizationSlug,
        email,
        'NewP@ssw0rd123',
      );
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({
        response: { errorCode: 'OTP_005' },
      });
      expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('U7 — consumeVerified() trả false PHẢI ngăn TOÀN BỘ mutation DB (không tra user, không hash mật khẩu, không mở transaction)', async () => {
      otpRepository.consumeVerified.mockResolvedValue(false);

      await expect(
        service.resetPassword(organizationSlug, email, 'NewP@ssw0rd123'),
      ).rejects.toThrow(BadRequestException);

      expect(
        userRepository.findByOrganizationSlugAndEmail,
      ).not.toHaveBeenCalled();
      expect(passwordHasher.hash).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sessionRepository.revokeAllForUser).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('U8 — passwordHash update và revokeAllForUser chạy CÙNG 1 lệnh $transaction, nhận CÙNG 1 tx (không phải 2 transaction độc lập)', async () => {
      otpRepository.consumeVerified.mockResolvedValue(true);
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.hash.mockResolvedValue('new-hash');
      const fakeTx = { marker: 'single-shared-tx' };
      prisma.$transaction.mockImplementationOnce(
        (fn: (tx: unknown) => unknown) => fn(fakeTx),
      );

      await service.resetPassword(organizationSlug, email, 'NewP@ssw0rd123');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(userRepository.updatePasswordHash).toHaveBeenCalledWith(
        user.id,
        'new-hash',
        fakeTx,
      );
      expect(sessionRepository.revokeAllForUser).toHaveBeenCalledWith(
        user.id,
        fakeTx,
      );
    });

    it('U9 — $transaction() thất bại (lỗi Postgres) PHẢI ném ra nguyên vẹn, KHÔNG âm thầm khôi phục/tái tạo lại authorization đã tiêu thụ ở Redis', async () => {
      otpRepository.consumeVerified.mockResolvedValue(true);
      userRepository.findByOrganizationSlugAndEmail.mockResolvedValue(user);
      passwordHasher.hash.mockResolvedValue('new-hash');
      const dbError = new Error('connection terminated unexpectedly');
      prisma.$transaction.mockRejectedValueOnce(dbError);

      await expect(
        service.resetPassword(organizationSlug, email, 'NewP@ssw0rd123'),
      ).rejects.toBe(dbError);

      // KHÔNG có bất kỳ lệnh Redis nào được gọi để "khôi phục" verified — service không sở hữu
      // cơ chế đó (D6, không phát minh 2PC). consumeVerified() đã được gọi đúng 1 lần trước đó,
      // KHÔNG gọi lại/không có thao tác bù trừ nào.
      expect(otpRepository.consumeVerified).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).not.toHaveBeenCalled();
    });
  });
});
