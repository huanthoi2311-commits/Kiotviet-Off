import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../redis/redis.constants';
import {
  ISignupOtpRepository,
  SignupOtpVerifyResult,
} from '../../domain/repositories/signup-otp.repository.interface';

const OTP_TTL_SECONDS = 5 * 60;
const SEND_COUNT_TTL_SECONDS = 60 * 60;
const COOLDOWN_TTL_SECONDS = 60;

/**
 * T053.04 D2 — Lua script chạy ATOMIC trong Redis (1 lệnh EVAL = không thể bị chen ngang bởi 1
 * lệnh khác), sửa đúng lỗ hổng của `RedisOtpRepository` (forgot-password): ở đó `get()` rồi
 * `incrementAttempts()` là 2 lệnh riêng biệt (read-modify-write race — 2 request verify sai OTP
 * đồng thời có thể cùng đọc attempts=0, cùng ghi attempts=1, đếm thiếu). Ở đây so khớp + xoá
 * (đúng) hoặc so khớp + tăng attempts (sai) đều xảy ra trong ĐÚNG 1 round-trip Redis không thể
 * chia cắt — "concurrent verification cannot consume the same OTP twice" là bất biến THẬT, không
 * phải giả định.
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
export class RedisSignupOtpRepository implements ISignupOtpRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private otpKey(normalizedEmail: string): string {
    return `signup:otp:${normalizedEmail}`;
  }

  private sendCountKey(normalizedEmail: string): string {
    return `signup:otp:sendcount:${normalizedEmail}`;
  }

  private cooldownKey(normalizedEmail: string): string {
    return `signup:otp:cooldown:${normalizedEmail}`;
  }

  async save(normalizedEmail: string, otpHash: string): Promise<void> {
    const record = { otpHash, attempts: 0 };
    await this.redis.set(
      this.otpKey(normalizedEmail),
      JSON.stringify(record),
      'EX',
      OTP_TTL_SECONDS,
    );
  }

  async verifyAndConsume(
    normalizedEmail: string,
    otpHash: string,
    maxAttempts: number,
  ): Promise<SignupOtpVerifyResult> {
    const raw = (await this.redis.eval(
      VERIFY_AND_CONSUME_SCRIPT,
      1,
      this.otpKey(normalizedEmail),
      otpHash,
      String(maxAttempts),
      String(OTP_TTL_SECONDS),
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
    return { outcome: 'OK' };
  }

  async incrementSendCount(normalizedEmail: string): Promise<number> {
    const key = this.sendCountKey(normalizedEmail);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, SEND_COUNT_TTL_SECONDS);
    }
    return count;
  }

  async getCooldownRemainingSeconds(normalizedEmail: string): Promise<number> {
    const ttl = await this.redis.ttl(this.cooldownKey(normalizedEmail));
    return ttl > 0 ? ttl : 0;
  }

  async startCooldown(normalizedEmail: string): Promise<void> {
    await this.redis.set(
      this.cooldownKey(normalizedEmail),
      '1',
      'EX',
      COOLDOWN_TTL_SECONDS,
    );
  }
}
