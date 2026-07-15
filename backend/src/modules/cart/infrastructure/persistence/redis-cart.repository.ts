import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../redis/redis.constants';
import { CartEntity } from '../../domain/entities/cart.entity';
import { ICartRepository } from '../../domain/repositories/cart.repository.interface';

/** Redis TTL 30 phút (Prompt 033) — reset về đủ 1800s ở mỗi lần save() (add/update/remove). */
const CART_TTL_SECONDS = 30 * 60;

@Injectable()
export class RedisCartRepository implements ICartRepository {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(organizationId: string, userId: string): string {
    return `cart:${organizationId}:${userId}`;
  }

  async findByUserId(
    organizationId: string,
    userId: string,
  ): Promise<CartEntity | null> {
    const raw = await this.redis.get(this.key(organizationId, userId));
    return raw ? (JSON.parse(raw) as CartEntity) : null;
  }

  async save(cart: CartEntity): Promise<void> {
    await this.redis.set(
      this.key(cart.organizationId, cart.userId),
      JSON.stringify(cart),
      'EX',
      CART_TTL_SECONDS,
    );
  }

  async delete(organizationId: string, userId: string): Promise<void> {
    await this.redis.del(this.key(organizationId, userId));
  }
}
