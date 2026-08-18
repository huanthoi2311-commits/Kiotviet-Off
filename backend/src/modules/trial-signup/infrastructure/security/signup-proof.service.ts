import { createHmac, randomBytes } from 'crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenExpiredError } from 'jsonwebtoken';

const PROOF_PURPOSE = 'trial_signup_proof';
const PROOF_EXPIRES_IN = '10m';
const PROOF_JTI_BYTES = 16;

export interface SignupProofPayload {
  purpose: typeof PROOF_PURPOSE;
  email: string;
  jti: string;
}

export type VerifySignupProofResult =
  | { outcome: 'OK'; email: string }
  | { outcome: 'EXPIRED' }
  | { outcome: 'INVALID' };

/**
 * T053.04 D2 — toàn bộ mật mã của Trial Signup (hash OTP, ký/xác minh signup proof token, hash
 * proof token để tra `trial_signup_finalizations`) SỐNG Ở ĐÂY, KHÔNG dùng chung `TokenService`
 * (forgot-password/refresh-token) — tách biệt hoàn toàn để không có rủi ro 1 thay đổi tương lai ở
 * `TokenService` vô tình ảnh hưởng luồng signup, và ngược lại (Architect Decision D2 "no purpose
 * confusion"). Dùng `JwtService` toàn cục (đã đăng ký ở `JwtConfigModule`) NHƯNG luôn truyền
 * `secret` RIÊNG (`signup.secret`) qua từng lời gọi — không đăng ký thêm `JwtModule` instance mới.
 *
 * Proof token là JWT tự chứa `{purpose, email, jti, iat, exp}`, ký HS256 — verify KHÔNG cần
 * round-trip Redis (khác OTP `verified` flag cũ của forgot-password), và không thể bị chấp nhận
 * nhầm làm access token vì secret khác hoàn toàn + `purpose` claim được kiểm tra tường minh.
 * `jti` là CSPRNG 128-bit sinh MỖI LẦN ký (KHÔNG suy ra từ email/thời gian) — bắt buộc để 2 lần
 * xác thực OTP thành công riêng biệt cho CÙNG 1 email (D4: không giới hạn 1-trial-per-email)
 * không bao giờ tạo ra proof token trùng nhau, kể cả khi ký trong cùng giây `iat`.
 */
@Injectable()
export class SignupProofService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    const secret = this.config.get<string>('signup.secret');
    if (!secret) {
      // Chỉ có thể xảy ra nếu triển khai bỏ qua bước cấu hình bắt buộc — env.validation.ts đã
      // chặn production khởi động thiếu biến này (assertProductionSignupSecretSet); ở dev/test
      // thiếu biến là lỗi cấu hình cục bộ, KHÔNG được âm thầm ký bằng secret rỗng/undefined.
      throw new InternalServerErrorException(
        'SIGNUP_SECRET chưa được cấu hình — không thể xử lý Trial Signup',
      );
    }
    return secret;
  }

  hashOtp(otp: string): string {
    return createHmac('sha256', this.secret()).update(otp).digest('hex');
  }

  signProof(normalizedEmail: string): string {
    const payload: SignupProofPayload = {
      purpose: PROOF_PURPOSE,
      email: normalizedEmail,
      // CSPRNG, độc lập với email/thời gian — bắt buộc để 2 proof hợp lệ (2 lần xác thực OTP
      // thành công riêng biệt cho CÙNG email) không bao giờ trùng token dù ký trong cùng giây
      // `iat` (payload/JWT xác định hoàn toàn bởi input → 2 lần ký cùng giây, cùng email, KHÔNG
      // có jti sẽ ra JWT giống hệt nhau — đã xác nhận là nguyên nhân CASE 29 409 giả ở CI).
      jti: randomBytes(PROOF_JTI_BYTES).toString('hex'),
    };
    return this.jwtService.sign(payload, {
      secret: this.secret(),
      expiresIn: PROOF_EXPIRES_IN,
    });
  }

  verifyProof(token: string): VerifySignupProofResult {
    try {
      const decoded = this.jwtService.verify<SignupProofPayload>(token, {
        secret: this.secret(),
      });
      if (
        decoded.purpose !== PROOF_PURPOSE ||
        !decoded.email ||
        typeof decoded.jti !== 'string' ||
        decoded.jti.length === 0
      ) {
        return { outcome: 'INVALID' };
      }
      return { outcome: 'OK', email: decoded.email };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return { outcome: 'EXPIRED' };
      }
      return { outcome: 'INVALID' };
    }
  }

  /** Khoá tra cứu `trial_signup_finalizations` — KHÔNG BAO GIỜ lưu token thô (cùng nguyên tắc
   * `Session.refreshTokenHash`). Token bản thân đã là 1 JWT ký HS256 128-bit+ entropy hiệu quả
   * (không phải secret người dùng đoán được như mật khẩu/OTP), nên HMAC thường (không cần salt
   * riêng-per-record) là đủ — dùng chung secret signup cho nhất quán, không cần secret thứ 3. */
  hashProofToken(token: string): string {
    return createHmac('sha256', this.secret()).update(token).digest('hex');
  }
}
