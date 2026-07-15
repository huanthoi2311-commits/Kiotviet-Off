import Redis from 'ioredis';
import { CartEntity } from '../../domain/entities/cart.entity';
import { RedisCartRepository } from './redis-cart.repository';

describe('RedisCartRepository', () => {
  let repository: RedisCartRepository;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  const cart: CartEntity = {
    organizationId: 'org-1',
    userId: 'user-1',
    items: [],
    subtotal: '0.00',
    totalDiscount: '0.00',
    totalPromotion: '0.00',
    totalVoucher: '0.00',
    totalTax: '0.00',
    totalAmount: '0.00',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };

  beforeEach(() => {
    redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    repository = new RedisCartRepository(redis as unknown as Redis);
  });

  describe('findByUserId', () => {
    it('trả về null khi Redis không có key', async () => {
      redis.get.mockResolvedValue(null);
      const result = await repository.findByUserId('org-1', 'user-1');
      expect(result).toBeNull();
      expect(redis.get).toHaveBeenCalledWith('cart:org-1:user-1');
    });

    it('parse JSON thành CartEntity khi Redis có dữ liệu', async () => {
      redis.get.mockResolvedValue(JSON.stringify(cart));
      const result = await repository.findByUserId('org-1', 'user-1');
      expect(result).toEqual(cart);
    });
  });

  describe('save', () => {
    it('ghi JSON kèm TTL 1800s theo key cart:{org}:{user}', async () => {
      await repository.save(cart);
      expect(redis.set).toHaveBeenCalledWith(
        'cart:org-1:user-1',
        JSON.stringify(cart),
        'EX',
        1800,
      );
    });
  });

  describe('delete', () => {
    it('xóa đúng key theo org + user', async () => {
      await repository.delete('org-1', 'user-1');
      expect(redis.del).toHaveBeenCalledWith('cart:org-1:user-1');
    });
  });
});
