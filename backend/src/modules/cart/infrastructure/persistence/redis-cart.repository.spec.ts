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
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
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

  // T030.12 — describe('[T017 Phase 3] mutate() — WATCH/MULTI/EXEC, retry, retry exhaustion',
  // ...) đã bị GỠ khỏi nhánh publication này: toàn bộ 8 test (và mock scaffolding watch/unwatch/
  // multi/nextCart chỉ phục vụ riêng chúng) phụ thuộc trực tiếp vào `RedisCartRepository.mutate()`
  // / `CartConcurrencyConflictError`, thuộc SPEC-T017-CHECKOUT-POS-001 §Phase 3, một carry-over
  // CHƯA được publish trong nhánh T030 này (xem
  // docs/setup/T030.12-CARRY-OVER-SOURCE-CLASSIFICATION.md §6). `RedisCartRepository` trên nhánh
  // này chỉ có findByUserId/save/delete — không có mutate() — nên các test này không compile được
  // ở đây. Bộ test đầy đủ (bao gồm các test này) ĐÃ được chạy và pass trong working tree gốc, đầy
  // đủ, không publish; việc gỡ ở đây chỉ là sửa cho nhất quán khi publish, không phải phát hiện
  // lỗi mới.

  describe('[T030.9] Redis không khả dụng — reject nguyên vẹn, KHÔNG unhandled rejection, KHÔNG fallback', () => {
    const redisDownError = new Error('connect ECONNREFUSED 127.0.0.1:6379');

    it('findByUserId() reject nguyên vẹn khi Redis lỗi (KHÔNG âm thầm trả null như "chưa có cart")', async () => {
      redis.get.mockRejectedValue(redisDownError);
      await expect(repository.findByUserId('org-1', 'user-1')).rejects.toBe(
        redisDownError,
      );
    });

    it('save() reject nguyên vẹn khi Redis lỗi', async () => {
      redis.set.mockRejectedValue(redisDownError);
      await expect(repository.save(cart)).rejects.toBe(redisDownError);
    });

    it('delete() reject nguyên vẹn khi Redis lỗi', async () => {
      redis.del.mockRejectedValue(redisDownError);
      await expect(repository.delete('org-1', 'user-1')).rejects.toBe(
        redisDownError,
      );
    });

    // T030.12 — 2 test 'mutate() reject nguyên vẹn khi WATCH/GET thất bại...' đã bị GỠ: cả 2 gọi
    // trực tiếp `repository.mutate(...)`, không tồn tại trên baseline RedisCartRepository của
    // nhánh publication này (xem ghi chú ở đầu file).
  });
});
