import { randomInt } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AUTH_USER_REPOSITORY } from '../domain/repositories/auth-user.repository.interface';
import type { IAuthUserRepository } from '../domain/repositories/auth-user.repository.interface';
import { SESSION_REPOSITORY } from '../domain/repositories/session.repository.interface';
import type { ISessionRepository } from '../domain/repositories/session.repository.interface';
import { OTP_REPOSITORY } from '../domain/repositories/otp.repository.interface';
import type { IOtpRepository } from '../domain/repositories/otp.repository.interface';
import { PASSWORD_HASHER } from '../domain/services/password-hasher.interface';
import type { IPasswordHasher } from '../domain/services/password-hasher.interface';
import { MailService } from '../infrastructure/mail/mail.service';
import { TokenService } from '../infrastructure/security/token.service';

const MAX_OTP_SEND_PER_HOUR = 5;
const MAX_OTP_VERIFY_ATTEMPTS = 5;

@Injectable()
export class ForgotPasswordService {
  constructor(
    @Inject(AUTH_USER_REPOSITORY)
    private readonly userRepository: IAuthUserRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: ISessionRepository,
    @Inject(OTP_REPOSITORY) private readonly otpRepository: IOtpRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private key(organizationSlug: string, email: string): string {
    return `${organizationSlug}:${email}`;
  }

  async requestOtp(organizationSlug: string, email: string): Promise<void> {
    const identifier = this.key(organizationSlug, email);

    const cooldown =
      await this.otpRepository.getCooldownRemainingSeconds(identifier);
    if (cooldown > 0) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_COOLDOWN_ACTIVE,
          `Vui lòng đợi ${cooldown} giây trước khi gửi lại OTP`,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const sendCount = await this.otpRepository.incrementSendCount(identifier);
    if (sendCount > MAX_OTP_SEND_PER_HOUR) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_RATE_LIMIT_EXCEEDED,
          'Bạn đã yêu cầu OTP quá 5 lần trong 1 giờ, vui lòng thử lại sau',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.otpRepository.startCooldown(identifier);

    const user = await this.userRepository.findByOrganizationSlugAndEmail(
      organizationSlug,
      email,
    );
    // Luôn trả về thành công dù email có tồn tại hay không — tránh lộ thông tin
    // tài khoản nào đang được sử dụng trong hệ thống (user enumeration).
    if (!user) return;

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = this.tokenService.hashOtp(otp);
    await this.otpRepository.save(identifier, otpHash);
    await this.mailService.sendOtpEmail(email, otp);
  }

  async verifyOtp(
    organizationSlug: string,
    email: string,
    otp: string,
  ): Promise<void> {
    const identifier = this.key(organizationSlug, email);
    const record = await this.otpRepository.get(identifier);
    if (!record) {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_INVALID_OR_EXPIRED,
          'OTP không tồn tại hoặc đã hết hạn, vui lòng yêu cầu lại',
        ),
      );
    }

    if (record.attempts >= MAX_OTP_VERIFY_ATTEMPTS) {
      await this.otpRepository.delete(identifier);
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
          'Vượt quá số lần thử OTP, vui lòng yêu cầu mã mới',
        ),
      );
    }

    const otpHash = this.tokenService.hashOtp(otp);
    if (otpHash !== record.otpHash) {
      await this.otpRepository.incrementAttempts(identifier);
      throw new BadRequestException(
        withCode(ErrorCode.OTP_INCORRECT, 'OTP không đúng'),
      );
    }

    await this.otpRepository.markVerified(identifier);
  }

  async resetPassword(
    organizationSlug: string,
    email: string,
    newPassword: string,
  ): Promise<void> {
    const identifier = this.key(organizationSlug, email);
    const verified = await this.otpRepository.isVerified(identifier);
    if (!verified) {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_NOT_VERIFIED,
          'Vui lòng xác thực OTP trước khi đặt lại mật khẩu',
        ),
      );
    }

    const user = await this.userRepository.findByOrganizationSlugAndEmail(
      organizationSlug,
      email,
    );
    if (!user) {
      throw new BadRequestException(
        withCode(ErrorCode.OTP_ACCOUNT_NOT_FOUND, 'Không tìm thấy tài khoản'),
      );
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.userRepository.updatePasswordHash(user.id, passwordHash);
    await this.otpRepository.delete(identifier);
    // Buộc đăng xuất toàn bộ thiết bị sau khi đổi mật khẩu.
    await this.sessionRepository.revokeAllForUser(user.id);

    await this.auditLogService.log({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'auth.password.reset',
      entityType: 'User',
      entityId: user.id,
    });
  }
}
