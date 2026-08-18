export interface SignupOtpRecord {
  otpHash: string;
  attempts: number;
}

/** Kết quả atomic verify-và-tiêu-thụ 1 lần gọi (T053.04 D2 — "OTP is genuinely single-use",
 * "concurrent verification cannot consume the same OTP twice"). */
export type SignupOtpVerifyResult =
  | { outcome: 'OK' }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'INCORRECT'; attempts: number }
  | { outcome: 'MAX_ATTEMPTS' };

/**
 * T053.04 D2 — namespace Redis RIÊNG, TÁCH BIỆT hoàn toàn khỏi `IOtpRepository`/
 * `RedisOtpRepository` (forgot-password) — không dùng chung state, không dùng chung key shape
 * (identifier ở đây là email đã chuẩn hóa, KHÔNG có organizationSlug vì Organization chưa tồn
 * tại tại thời điểm signup). Khác `IOtpRepository` ở 1 điểm cốt lõi: `verifyAndConsume()` là 1
 * thao tác ATOMIC DUY NHẤT (so khớp + tăng attempts HOẶC xoá-nếu-đúng trong 1 lệnh Redis Lua) —
 * sửa đúng lỗ hổng đã phát hiện ở forgot-password (D13: không sửa forgot-password, nhưng component
 * MỚI này không được kế thừa lỗ hổng đó).
 */
export interface ISignupOtpRepository {
  /** Ghi đè OTP cũ nếu có (newest invalidates previous — D2/D11 "chỉ OTP mới nhất còn hiệu lực"). */
  save(normalizedEmail: string, otpHash: string): Promise<void>;
  /** So khớp `otpHash` với bản ghi hiện tại — ATOMIC: khớp → xoá record (single-use thật);
   * không khớp → tăng `attempts`; đạt ngưỡng tối đa → xoá record, trả `MAX_ATTEMPTS`. */
  verifyAndConsume(
    normalizedEmail: string,
    otpHash: string,
    maxAttempts: number,
  ): Promise<SignupOtpVerifyResult>;
  /** Đếm số lần gửi OTP trong cửa sổ 1 giờ, dùng cho rate-limit (5 lần/giờ, cùng ngưỡng forgot-password). */
  incrementSendCount(normalizedEmail: string): Promise<number>;
  getCooldownRemainingSeconds(normalizedEmail: string): Promise<number>;
  startCooldown(normalizedEmail: string): Promise<void>;
}

export const SIGNUP_OTP_REPOSITORY = Symbol('SIGNUP_OTP_REPOSITORY');
