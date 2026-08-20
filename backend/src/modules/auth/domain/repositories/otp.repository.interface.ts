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
  /** Đếm số lần gửi OTP trong cửa sổ 1 giờ, dùng cho rate-limit (5 lần/giờ). */
  incrementSendCount(identifier: string): Promise<number>;
  /**
   * T053.06B-2 (D1/D3) — thay thế hoàn toàn `isVerified()` (GET đơn thuần, KHÔNG tiêu thụ — đúng
   * lỗ hổng double-finalization race đã xác nhận ở Discovery §2/§3: 2 request reset đồng thời CÙNG
   * đọc được `verified=true` trước khi bất kỳ request nào xoá cờ). Đây là 1 lệnh Redis nguyên tử
   * DUY NHẤT (GETDEL — KHÔNG phải GET rồi DEL riêng biệt ở tầng application, đúng lớp lỗi B-1 đã
   * sửa 1 lần cho `verifyAndConsume`, không lặp lại ở đây): trả `true` CHỈ cho ĐÚNG 1 lệnh gọi đầu
   * tiên trong N lệnh gọi đồng thời trên cùng `identifier`; mọi lệnh gọi sau đó — kể cả từ chính
   * request đã tiêu thụ thành công nếu gọi lại — đều nhận `false`. `save()` (yêu cầu OTP mới) vẫn
   * xoá cờ `verified` cũ như trước (D7 — không đổi).
   */
  consumeVerified(identifier: string): Promise<boolean>;
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
