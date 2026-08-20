export interface OtpRecord {
  otpHash: string;
  attempts: number;
}

/**
 * T053.06B-1 — kết quả của `verifyAndConsume()`, cùng shape với
 * `SignupOtpVerifyResult` (`trial-signup/domain/repositories/signup-otp.repository.interface.ts`)
 * — không import chung (auth/trial-signup là 2 bounded context riêng biệt, xem lý do tách biệt ở
 * `RedisOtpRepository`), chỉ mượn CÙNG HÌNH DẠNG đã được review.
 */
export type OtpVerifyResult =
  | { outcome: 'OK' }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'INCORRECT'; attempts: number }
  | { outcome: 'MAX_ATTEMPTS' };

export interface IOtpRepository {
  /** Lưu OTP đã hash theo key, TTL cố định (5 phút — Prompt 014). Ghi đè OTP cũ nếu có. */
  save(identifier: string, otpHash: string): Promise<void>;
  get(identifier: string): Promise<OtpRecord | null>;
  /**
   * T053.06B-1 — thay thế hoàn toàn chuỗi `get()` → so khớp ở application code → `incrementAttempts()`
   * HOẶC `markVerified()` (đã bị xoá khỏi interface này — không còn caller nào khác ngoài chuỗi cũ
   * vừa bị thay thế, xác nhận qua Mandatory Source Verification). Toàn bộ so khớp + đếm lượt thử +
   * đánh dấu verified + xoá OTP đều nằm trong ĐÚNG 1 lệnh Redis Lua (EVAL) không thể bị chen ngang —
   * "concurrent verification cannot lose an attempt increment" là bất biến THẬT, không phải giả
   * định (xem `RedisOtpRepository`'s `VERIFY_AND_CONSUME_SCRIPT` cho chi tiết atomic semantics).
   */
  verifyAndConsume(
    identifier: string,
    otpHash: string,
    maxAttempts: number,
  ): Promise<OtpVerifyResult>;
  delete(identifier: string): Promise<void>;
  /** Đếm số lần gửi OTP trong cửa sổ 1 giờ, dùng cho rate-limit (5 lần/giờ). */
  incrementSendCount(identifier: string): Promise<number>;
  isVerified(identifier: string): Promise<boolean>;
  /** Giây còn lại trước khi được gửi OTP tiếp theo; 0 nếu không trong cooldown. */
  getCooldownRemainingSeconds(identifier: string): Promise<number>;
  startCooldown(identifier: string): Promise<void>;
  /**
   * T053.06B-1 — throttle account-scoped độc lập IP (§6), cùng identifier non-oracle-safe đã dùng
   * cho cooldown/sendcount (tính TRƯỚC bước kiểm tra User có tồn tại hay không — không tạo oracle
   * mới), cùng shape đơn giản với `incrementSendCount()` (đếm + tự đặt TTL ở lần đầu, KHÔNG phải
   * dạng cooldown-giữa-2-lần như `startCooldown()`). Đếm số lần VERIFY (đúng hoặc sai) trong cửa sổ
   * 1 giờ, KHÔNG phải số lần GỬI (đã có `incrementSendCount` riêng).
   */
  incrementVerifyAttemptWindowCount(identifier: string): Promise<number>;
}

export const OTP_REPOSITORY = Symbol('OTP_REPOSITORY');
