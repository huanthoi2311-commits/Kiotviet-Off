import { randomInt } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { MailService } from '../../auth/infrastructure/mail/mail.service';
import { SIGNUP_OTP_REPOSITORY } from '../domain/repositories/signup-otp.repository.interface';
import type { ISignupOtpRepository } from '../domain/repositories/signup-otp.repository.interface';
import { SignupProofService } from '../infrastructure/security/signup-proof.service';
import { SignupProofResponseDto } from './dto/signup-proof-response.dto';

const MAX_OTP_SEND_PER_HOUR = 5;
const MAX_OTP_VERIFY_ATTEMPTS = 5;

/**
 * T053.04 D2/D5/D14 — độc lập hoàn toàn khỏi `ForgotPasswordService` (không chia sẻ state, không
 * import lẫn nhau) dù có hình dạng tương tự (cùng ngưỡng cooldown/rate-limit/max-attempts với
 * forgot-password — số CÙNG, cơ chế RIÊNG). Email luôn được chuẩn hóa `trim().toLowerCase()`
 * TRƯỚC khi dùng làm khoá Redis hay đưa vào proof token (D5) — nhất quán xuyên suốt OTP → proof →
 * tạo Owner User.
 */
@Injectable()
export class SignupOtpService {
  constructor(
    @Inject(SIGNUP_OTP_REPOSITORY)
    private readonly otpRepository: ISignupOtpRepository,
    private readonly signupProof: SignupProofService,
    private readonly mailService: MailService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** D14 — "request-otp must not reveal whether the email already exists" — signup vốn không tra
   * cứu email tồn tại hay chưa (D4: nhiều Organization có thể cùng email), nên KHÔNG có nhánh rẽ
   * nào để lộ thông tin — luôn gửi OTP cho MỌI email hợp lệ về mặt cú pháp (khác forgot-password,
   * vốn phải giấu "user not found" vì nó tra cứu 1 tài khoản có thật). */
  async requestOtp(email: string): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);

    const cooldown =
      await this.otpRepository.getCooldownRemainingSeconds(normalizedEmail);
    if (cooldown > 0) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_COOLDOWN_ACTIVE,
          `Vui lòng đợi ${cooldown} giây trước khi gửi lại OTP`,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const sendCount =
      await this.otpRepository.incrementSendCount(normalizedEmail);
    if (sendCount > MAX_OTP_SEND_PER_HOUR) {
      throw new HttpException(
        withCode(
          ErrorCode.OTP_RATE_LIMIT_EXCEEDED,
          'Bạn đã yêu cầu OTP quá 5 lần trong 1 giờ, vui lòng thử lại sau',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.otpRepository.startCooldown(normalizedEmail);

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpHash = this.signupProof.hashOtp(otp);
    await this.otpRepository.save(normalizedEmail, otpHash);
    await this.mailService.sendOtpEmail(normalizedEmail, otp, 'TRIAL_SIGNUP');
  }

  async verifyOtp(email: string, otp: string): Promise<SignupProofResponseDto> {
    const normalizedEmail = this.normalizeEmail(email);
    const otpHash = this.signupProof.hashOtp(otp);

    const result = await this.otpRepository.verifyAndConsume(
      normalizedEmail,
      otpHash,
      MAX_OTP_VERIFY_ATTEMPTS,
    );

    if (result.outcome === 'NOT_FOUND') {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_INVALID_OR_EXPIRED,
          'OTP không tồn tại hoặc đã hết hạn, vui lòng yêu cầu lại',
        ),
      );
    }
    if (result.outcome === 'MAX_ATTEMPTS') {
      throw new BadRequestException(
        withCode(
          ErrorCode.OTP_MAX_ATTEMPTS_EXCEEDED,
          'Vượt quá số lần thử OTP, vui lòng yêu cầu mã mới',
        ),
      );
    }
    if (result.outcome === 'INCORRECT') {
      throw new BadRequestException(
        withCode(ErrorCode.OTP_INCORRECT, 'OTP không đúng'),
      );
    }

    const signupProofToken = this.signupProof.signProof(normalizedEmail);
    return {
      signupProofToken,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }
}
