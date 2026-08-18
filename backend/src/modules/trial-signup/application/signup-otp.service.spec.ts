import { HttpException } from '@nestjs/common';
import { SignupOtpService } from './signup-otp.service';
import type { ISignupOtpRepository } from '../domain/repositories/signup-otp.repository.interface';
import { SignupProofService } from '../infrastructure/security/signup-proof.service';
import { MailService } from '../../auth/infrastructure/mail/mail.service';

describe('SignupOtpService (T053.04 D2/D5/D14)', () => {
  let otpRepository: jest.Mocked<ISignupOtpRepository>;
  let signupProof: jest.Mocked<
    Pick<SignupProofService, 'hashOtp' | 'signProof'>
  >;
  let mailService: jest.Mocked<Pick<MailService, 'sendOtpEmail'>>;
  let service: SignupOtpService;

  beforeEach(() => {
    otpRepository = {
      save: jest.fn(),
      verifyAndConsume: jest.fn(),
      incrementSendCount: jest.fn(),
      getCooldownRemainingSeconds: jest.fn(),
      startCooldown: jest.fn(),
    };
    signupProof = {
      hashOtp: jest.fn().mockReturnValue('hashed-otp'),
      signProof: jest.fn().mockReturnValue('signed-proof-token'),
    };
    mailService = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };

    service = new SignupOtpService(
      otpRepository,
      signupProof as unknown as SignupProofService,
      mailService as unknown as MailService,
    );
  });

  describe('normalizeEmail (D5)', () => {
    it('trim() + toLowerCase()', () => {
      expect(service.normalizeEmail('  Owner@ACME.com  ')).toBe(
        'owner@acme.com',
      );
    });
  });

  describe('requestOtp', () => {
    it('chuẩn hóa email TRƯỚC khi dùng làm khoá Redis/gửi mail — "Owner@ACME.com" và "owner@acme.com" cùng 1 khoá', async () => {
      otpRepository.getCooldownRemainingSeconds.mockResolvedValue(0);
      otpRepository.incrementSendCount.mockResolvedValue(1);

      await service.requestOtp('  Owner@ACME.com  ');

      expect(otpRepository.getCooldownRemainingSeconds).toHaveBeenCalledWith(
        'owner@acme.com',
      );
      expect(otpRepository.save).toHaveBeenCalledWith(
        'owner@acme.com',
        'hashed-otp',
      );
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith(
        'owner@acme.com',
        expect.any(String),
        'TRIAL_SIGNUP',
      );
    });

    it('LUÔN gửi OTP cho MỌI email hợp lệ cú pháp — D14 "request-otp must not reveal whether the email already exists" (không có nhánh tra cứu tồn tại)', async () => {
      otpRepository.getCooldownRemainingSeconds.mockResolvedValue(0);
      otpRepository.incrementSendCount.mockResolvedValue(1);

      await expect(
        service.requestOtp('anything-not-registered@x.com'),
      ).resolves.toBeUndefined();
      expect(mailService.sendOtpEmail).toHaveBeenCalled();
    });

    it('đang cooldown → HttpException 429 OTP_COOLDOWN_ACTIVE, KHÔNG gửi mail', async () => {
      otpRepository.getCooldownRemainingSeconds.mockResolvedValue(42);

      await expect(service.requestOtp('a@b.com')).rejects.toThrow(
        HttpException,
      );
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
      expect(otpRepository.incrementSendCount).not.toHaveBeenCalled();
    });

    it('vượt quá 5 lần/giờ → HttpException 429 OTP_RATE_LIMIT_EXCEEDED, KHÔNG gửi mail', async () => {
      otpRepository.getCooldownRemainingSeconds.mockResolvedValue(0);
      otpRepository.incrementSendCount.mockResolvedValue(6);

      await expect(service.requestOtp('a@b.com')).rejects.toThrow(
        HttpException,
      );
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('OTP mới GHI ĐÈ (overwrite) — chỉ gọi save() 1 lần cho 1 lần request thành công (D11 "newest invalidates previous")', async () => {
      otpRepository.getCooldownRemainingSeconds.mockResolvedValue(0);
      otpRepository.incrementSendCount.mockResolvedValue(1);

      await service.requestOtp('a@b.com');

      expect(otpRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyOtp', () => {
    it('OK → trả signupProofToken + expiresAt, gọi hashOtp/signProof với email đã chuẩn hóa', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({ outcome: 'OK' });

      const result = await service.verifyOtp('Owner@ACME.com', '123456');

      expect(otpRepository.verifyAndConsume).toHaveBeenCalledWith(
        'owner@acme.com',
        'hashed-otp',
        5,
      );
      expect(signupProof.signProof).toHaveBeenCalledWith('owner@acme.com');
      expect(result.signupProofToken).toBe('signed-proof-token');
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('NOT_FOUND → OTP_INVALID_OR_EXPIRED (400)', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({
        outcome: 'NOT_FOUND',
      });
      await expect(service.verifyOtp('a@b.com', '000000')).rejects.toThrow();
      expect(signupProof.signProof).not.toHaveBeenCalled();
    });

    it('INCORRECT → OTP_INCORRECT (400), KHÔNG cấp proof', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({
        outcome: 'INCORRECT',
        attempts: 1,
      });
      await expect(service.verifyOtp('a@b.com', '000000')).rejects.toThrow();
      expect(signupProof.signProof).not.toHaveBeenCalled();
    });

    it('MAX_ATTEMPTS → OTP_MAX_ATTEMPTS_EXCEEDED (400), KHÔNG cấp proof', async () => {
      otpRepository.verifyAndConsume.mockResolvedValue({
        outcome: 'MAX_ATTEMPTS',
      });
      await expect(service.verifyOtp('a@b.com', '000000')).rejects.toThrow();
      expect(signupProof.signProof).not.toHaveBeenCalled();
    });
  });
});
