export interface OtpRecord {
  otpHash: string;
  attempts: number;
}

export interface IOtpRepository {
  /** Lưu OTP đã hash theo key, TTL cố định (5 phút — Prompt 014). Ghi đè OTP cũ nếu có. */
  save(identifier: string, otpHash: string): Promise<void>;
  get(identifier: string): Promise<OtpRecord | null>;
  incrementAttempts(identifier: string): Promise<number>;
  delete(identifier: string): Promise<void>;
  /** Đếm số lần gửi OTP trong cửa sổ 1 giờ, dùng cho rate-limit (5 lần/giờ). */
  incrementSendCount(identifier: string): Promise<number>;
  /** Đánh dấu OTP đã xác thực thành công, cho phép bước reset-password kế tiếp (TTL 5 phút). */
  markVerified(identifier: string): Promise<void>;
  isVerified(identifier: string): Promise<boolean>;
  /** Giây còn lại trước khi được gửi OTP tiếp theo; 0 nếu không trong cooldown. */
  getCooldownRemainingSeconds(identifier: string): Promise<number>;
  startCooldown(identifier: string): Promise<void>;
}

export const OTP_REPOSITORY = Symbol('OTP_REPOSITORY');
