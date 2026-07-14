import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../redis/redis.constants';
import {
  IOtpRepository,
  OtpRecord,
} from '../../domain/repositories/otp.repository.interface';

const OTP_TTL_SECONDS = 5 * 60;
const VERIFIED_TTL_SECONDS = 5 * 60;
const SEND_COUNT_TTL_SECONDS = 60 * 60;
const COOLDOWN_TTL_SECONDS = 60;

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

  async get(identifier: string): Promise<OtpRecord | null> {
    const raw = await this.redis.get(this.otpKey(identifier));
    return raw ? (JSON.parse(raw) as OtpRecord) : null;
  }

  async incrementAttempts(identifier: string): Promise<number> {
    const record = await this.get(identifier);
    if (!record) return 0;
    const ttl = await this.redis.ttl(this.otpKey(identifier));
    const updated: OtpRecord = { ...record, attempts: record.attempts + 1 };
    await this.redis.set(
      this.otpKey(identifier),
      JSON.stringify(updated),
      'EX',
      ttl > 0 ? ttl : OTP_TTL_SECONDS,
    );
    return updated.attempts;
  }

  async delete(identifier: string): Promise<void> {
    await this.redis.del(this.otpKey(identifier), this.verifiedKey(identifier));
  }

  async incrementSendCount(identifier: string): Promise<number> {
    const key = this.sendCountKey(identifier);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, SEND_COUNT_TTL_SECONDS);
    }
    return count;
  }

  async markVerified(identifier: string): Promise<void> {
    await this.redis.set(
      this.verifiedKey(identifier),
      '1',
      'EX',
      VERIFIED_TTL_SECONDS,
    );
  }

  async isVerified(identifier: string): Promise<boolean> {
    const value = await this.redis.get(this.verifiedKey(identifier));
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
}
