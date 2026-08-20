import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../redis/redis.constants';
import {
  IOtpRepository,
  OtpRecord,
  OtpVerifyResult,
} from '../../domain/repositories/otp.repository.interface';

const OTP_TTL_SECONDS = 5 * 60;
const VERIFIED_TTL_SECONDS = 5 * 60;
const SEND_COUNT_TTL_SECONDS = 60 * 60;
const COOLDOWN_TTL_SECONDS = 60;
// T053.06B-1 (§6) — cửa sổ throttle account-scoped cho verify-otp, độc lập IP. KHÔNG phát minh
// số mới: 1 giờ khớp CHÍNH XÁC cửa sổ đã có của `incrementSendCount` (SEND_COUNT_TTL_SECONDS) —
// cùng 1 "phiên tấn công" logic dùng chung 1 cửa sổ thời gian.
const VERIFY_ATTEMPT_WINDOW_TTL_SECONDS = 60 * 60;

/**
 * T053.06B-1 — Lua script chạy ATOMIC trong Redis (1 lệnh EVAL = không thể bị chen ngang bởi 1
 * lệnh khác), mirror ĐÚNG mẫu hình đã được review/chạy thật của
 * `RedisSignupOtpRepository.VERIFY_AND_CONSUME_SCRIPT` (trial-signup module) — KHÔNG import/couple
 * 2 module (auth và trial-signup là 2 bounded context riêng biệt, xem chính doc-comment của
 * `SignupProofService` lý giải vì sao secret/cơ chế signup tách biệt hoàn toàn khỏi auth và ngược
 * lại) — chỉ tái hiện lại đúng SHAPE của Lua script đã được duyệt, KHÔNG dùng chung code/module.
 *
 * Khác `VERIFY_AND_CONSUME_SCRIPT` của signup ở đúng 1 điểm cấu trúc: signup xoá OTP ngay khi đúng
 * (không có bước "verified, chờ dùng sau"); forgot-password vẫn giữ kiến trúc `verified`-flag
 * riêng biệt (khác thời điểm với lúc verify — `resetPassword()` gọi sau, không phải ngay lập tức)
 * — nên nhánh đúng ở đây SET verified key (giữ nguyên TTL 5 phút đã có) THAY VÌ chỉ xoá OTP suông.
 * T053.06B-2 — `resetPassword()` giờ TIÊU THỤ atomic cờ này qua `consumeVerified()`/`GETDEL` (xem
 * bên dưới), không còn đọc suông (`isVerified()`) như trước.
 *
 * KQ trả về: {"OK"} | {"NOT_FOUND"} | {"INCORRECT", attempts} | {"MAX_ATTEMPTS"}
 */
const VERIFY_AND_CONSUME_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return {"NOT_FOUND"}
end
local data = cjson.decode(raw)
local maxAttempts = tonumber(ARGV[2])
if data.attempts >= maxAttempts then
  redis.call('DEL', KEYS[1])
  return {"MAX_ATTEMPTS"}
end
if data.otpHash == ARGV[1] then
  redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[4]))
  redis.call('DEL', KEYS[1])
  return {"OK"}
end
data.attempts = data.attempts + 1
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  ttl = tonumber(ARGV[3])
end
redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ttl)
return {"INCORRECT", tostring(data.attempts)}
`;

@Injectable()
export class RedisOtpRepository implements IOtpRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private otpKey(identifier: string) {
    return `auth:otp:${identifier}`;
  }

  private verifiedKey(identifier: string) {
    return `auth:otp:verified:${identifier}`;
  }

  private sendCountKey(identifier: string) {
    return `auth:otp:sendcount:${identifier}`;
  }

  private cooldownKey(identifier: string) {
    return `auth:otp:cooldown:${identifier}`;
  }

  private verifyAttemptWindowKey(identifier: string) {
    return `auth:otp:verifywindow:${identifier}`;
  }

  async save(identifier: string, otpHash: string): Promise<void> {
    const record: OtpRecord = { otpHash, attempts: 0 };
    await this.redis.set(
      this.otpKey(identifier),
      JSON.stringify(record),
      'EX',
      OTP_TTL_SECONDS,
    );
    await this.redis.del(this.verifiedKey(identifier));
  }

  async verifyAndConsume(
    identifier: string,
    otpHash: string,
    maxAttempts: number,
  ): Promise<OtpVerifyResult> {
    const raw = (await this.redis.eval(
      VERIFY_AND_CONSUME_SCRIPT,
      2,
      this.otpKey(identifier),
      this.verifiedKey(identifier),
      otpHash,
      String(maxAttempts),
      String(OTP_TTL_SECONDS),
      String(VERIFIED_TTL_SECONDS),
    )) as [string] | [string, string];

    const [outcome, attemptsRaw] = raw;
    if (outcome === 'INCORRECT') {
      return { outcome: 'INCORRECT', attempts: Number(attemptsRaw) };
    }
    if (outcome === 'MAX_ATTEMPTS') {
      return { outcome: 'MAX_ATTEMPTS' };
    }
    if (outcome === 'NOT_FOUND') {
      return { outcome: 'NOT_FOUND' };
    }
    if (outcome === 'OK') {
      return { outcome: 'OK' };
    }
    // T053.06B-1 (§12) — kết quả Lua không thuộc 4 outcome đã biết PHẢI fail closed (ném lỗi), KHÔNG
    // được âm thầm coi là bất kỳ outcome nào — cùng nguyên tắc AD-5/T030.9 "Redis failure does not
    // bypass security" áp dụng cho cả kết quả dị dạng, không chỉ lỗi kết nối.
    throw new Error(
      `RedisOtpRepository.verifyAndConsume: kết quả Lua không xác định: ${JSON.stringify(raw)}`,
    );
  }

  async incrementSendCount(identifier: string): Promise<number> {
    const key = this.sendCountKey(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, SEND_COUNT_TTL_SECONDS);
    }
    return count;
  }

  /**
   * T053.06B-2 (D1/D3/§6) — `GETDEL` là 1 lệnh Redis nguyên tử DUY NHẤT (native command, Redis
   * >= 6.2 — dự án chạy `redis:7-alpine`), KHÔNG phải `GET` rồi `DEL` riêng biệt ở tầng
   * application (đúng lớp lỗi race condition B-1 đã sửa 1 lần cho `verifyAndConsume`, không lặp
   * lại ở đây). Lỗi Redis (mất kết nối...) PHẢI ném ra nguyên vẹn — KHÔNG được diễn giải thành
   * `false` một cách âm thầm (AD-5/T030.9 "Redis failure does not bypass security" — ở đây nghĩa
   * là lỗi Redis không được vô tình cho phép MỘT reset nào đi qua, cũng không được vô tình chặn
   * một reset hợp lệ mà không báo lỗi rõ ràng).
   */
  async consumeVerified(identifier: string): Promise<boolean> {
    const value = await this.redis.getdel(this.verifiedKey(identifier));
    return value === '1';
  }

  async getCooldownRemainingSeconds(identifier: string): Promise<number> {
    const ttl = await this.redis.ttl(this.cooldownKey(identifier));
    return ttl > 0 ? ttl : 0;
  }

  async startCooldown(identifier: string): Promise<void> {
    await this.redis.set(
      this.cooldownKey(identifier),
      '1',
      'EX',
      COOLDOWN_TTL_SECONDS,
    );
  }

  async incrementVerifyAttemptWindowCount(identifier: string): Promise<number> {
    const key = this.verifyAttemptWindowKey(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, VERIFY_ATTEMPT_WINDOW_TTL_SECONDS);
    }
    return count;
  }
}
