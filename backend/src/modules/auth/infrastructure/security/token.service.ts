import { createHmac, randomBytes } from 'crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms from 'ms';
import { JwtAccessPayload } from '../../../../common/types/jwt-payload.type';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccessToken(payload: JwtAccessPayload): string {
    return this.jwtService.sign(payload);
  }

  generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw = randomBytes(64).toString('hex');
    const hash = this.hashRefreshToken(raw);
    const expiresIn = this.config.get<string>('jwt.refreshExpiresIn')!;
    const expiresAt = new Date(Date.now() + ms(expiresIn as ms.StringValue));
    return { raw, hash, expiresAt };
  }

  hashRefreshToken(raw: string): string {
    const secret = this.config.get<string>('jwt.refreshSecret')!;
    return createHmac('sha256', secret).update(raw).digest('hex');
  }

  /**
   * T053.06B-1 (Architect Decision — secret riêng, giữ nguyên D2 "no purpose confusion") — trước
   * đây là SHA-256 trần (không khoá), nay là HMAC-SHA256 khoá bởi `FORGOT_PASSWORD_OTP_SECRET`
   * — secret ĐỘC LẬP, KHÔNG dùng chung `jwt.refreshSecret`/`jwt.accessSecret`/`signup.secret`
   * (xem `env.validation.ts`'s `PRODUCTION_SECRET_PLACEHOLDERS`/`assertProductionForgotPasswordOtpSecretSet`).
   * Ném lỗi rõ ràng nếu secret chưa cấu hình (khác `hashRefreshToken` ở trên dùng `!` — vì
   * `jwt.refreshSecret` BẮT BUỘC ở MỌI môi trường qua `env.validation.ts`'s `@IsNotEmpty()`, còn
   * `forgotPasswordOtp.secret` CHỈ optional ở dev/test giống hệt `signup.secret` — mirror ĐÚNG cách
   * `SignupProofService.secret()` xử lý, không phải cách `hashRefreshToken` xử lý, vì cùng shape
   * optional/required). KHÔNG thêm salt/random — verify phải tái tạo lại ĐÚNG digest để so khớp
   * bên trong Lua script (`RedisOtpRepository.VERIFY_AND_CONSUME_SCRIPT`).
   */
  hashOtp(otp: string): string {
    const secret = this.config.get<string>('forgotPasswordOtp.secret');
    if (!secret) {
      throw new InternalServerErrorException(
        'FORGOT_PASSWORD_OTP_SECRET chưa được cấu hình — không thể xử lý forgot-password OTP',
      );
    }
    return createHmac('sha256', secret).update(otp).digest('hex');
  }
}
