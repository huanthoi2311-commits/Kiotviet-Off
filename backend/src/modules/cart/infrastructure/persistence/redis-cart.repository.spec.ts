import Redis from 'ioredis';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CartConcurrencyConflictError } from '../../domain/repositories/cart.repository.interface';
import { RedisCartRepository } from './redis-cart.repository';

describe('RedisCartRepository', () => {
  let repository: RedisCartRepository;
  let multi: { set: jest.Mock; exec: jest.Mock };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    watch: jest.Mock;
    unwatch: jest.Mock;
    multi: jest.Mock;
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

  const nextCart: CartEntity = {
    ...cart,
    items: [
      {
        productId: 'prod-1',
        productName: 'Áo thun',
        quantity: '1.000',
        price: '100000.00',
        discount: '0.00',
        promotion: '0.00',
        voucher: '0.00',
        tax: '10000.00',
        total: '110000.00',
      },
    ],
    totalAmount: '110000.00',
  };

  beforeEach(() => {
    multi = { set: jest.fn().mockReturnThis(), exec: jest.fn() };
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      watch: jest.fn().mockResolvedValue('OK'),
      unwatch: jest.fn().mockResolvedValue('OK'),
      multi: jest.fn(() => multi),
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

  describe('[T017 Phase 3] mutate() — WATCH/MULTI/EXEC, retry, retry exhaustion', () => {
    it('[1] thành công KHÔNG cần retry — WATCH → GET → mutator(current) → MULTI/SET/EXEC, mutator chỉ gọi đúng 1 lần', async () => {
      redis.get.mockResolvedValue(null);
      multi.exec.mockResolvedValue([[null, 'OK']]);
      const mutator = jest.fn().mockReturnValue(nextCart);

      const result = await repository.mutate('org-1', 'user-1', mutator);

      expect(redis.watch).toHaveBeenCalledTimes(1);
      expect(redis.watch).toHaveBeenCalledWith('cart:org-1:user-1');
      expect(mutator).toHaveBeenCalledTimes(1);
      expect(result).toBe(nextCart);
    });

    it('[2] EXEC trả null ở lần đầu (WATCH bị 1 client khác ghi đè) — tự retry và thành công ở lần thứ 2', async () => {
      redis.get.mockResolvedValue(null);
      multi.exec
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([[null, 'OK']]);
      const mutator = jest.fn().mockReturnValue(nextCart);

      const result = await repository.mutate('org-1', 'user-1', mutator);

      expect(redis.watch).toHaveBeenCalledTimes(2);
      expect(mutator).toHaveBeenCalledTimes(2);
      expect(result).toBe(nextCart);
    });

    it('[3] EXEC liên tục trả null vượt quá số lần retry mặc định (5) — ném CartConcurrencyConflictError', async () => {
      redis.get.mockResolvedValue(null);
      multi.exec.mockResolvedValue(null);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await expect(
        repository.mutate('org-1', 'user-1', mutator),
      ).rejects.toThrow(CartConcurrencyConflictError);
      expect(redis.watch).toHaveBeenCalledTimes(5);
      expect(mutator).toHaveBeenCalledTimes(5);
    });

    it('[4] decode đúng "current" từ JSON có sẵn trong Redis trước khi truyền vào mutator', async () => {
      redis.get.mockResolvedValue(JSON.stringify(cart));
      multi.exec.mockResolvedValue([[null, 'OK']]);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await repository.mutate('org-1', 'user-1', mutator);

      expect(mutator).toHaveBeenCalledWith(cart);
    });

    it('[4b] current = null khi Redis chưa có key (Cart chưa từng được tạo)', async () => {
      redis.get.mockResolvedValue(null);
      multi.exec.mockResolvedValue([[null, 'OK']]);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await repository.mutate('org-1', 'user-1', mutator);

      expect(mutator).toHaveBeenCalledWith(null);
    });

    it('[5] serialize kết quả trả về từ mutator() thành JSON trước khi SET trong MULTI', async () => {
      redis.get.mockResolvedValue(null);
      multi.exec.mockResolvedValue([[null, 'OK']]);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await repository.mutate('org-1', 'user-1', mutator);

      expect(multi.set).toHaveBeenCalledWith(
        'cart:org-1:user-1',
        JSON.stringify(nextCart),
        'EX',
        1800,
      );
    });

    it('[6] TTL 1800s được giữ nguyên ở mỗi lần SET thành công qua mutate() — giống hệt save()', async () => {
      redis.get.mockResolvedValue(null);
      multi.exec.mockResolvedValue([[null, 'OK']]);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await repository.mutate('org-1', 'user-1', mutator);

      const [, , flag, ttl] = multi.set.mock.calls[0] as [
        string,
        string,
        string,
        number,
      ];
      expect(flag).toBe('EX');
      expect(ttl).toBe(1800);
    });

    it('mutator tự throw lỗi nghiệp vụ (vd item không còn trong giỏ) — UNWATCH ngay rồi rethrow nguyên vẹn, KHÔNG tính là 1 lần retry, KHÔNG bị nuốt thành CartConcurrencyConflictError', async () => {
      redis.get.mockResolvedValue(null);
      const businessError = new Error('CART_ITEM_NOT_FOUND');
      const mutator = jest.fn().mockImplementation(() => {
        throw businessError;
      });

      await expect(repository.mutate('org-1', 'user-1', mutator)).rejects.toBe(
        businessError,
      );
      expect(redis.unwatch).toHaveBeenCalledTimes(1);
      expect(multi.exec).not.toHaveBeenCalled();
      expect(redis.watch).toHaveBeenCalledTimes(1);
    });
  });

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

    it('mutate() reject nguyên vẹn khi WATCH thất bại (Redis lỗi TRƯỚC khi mutator từng chạy) — KHÔNG tính là 1 lần retry, KHÔNG lặp lại 5 lần vô ích', async () => {
      redis.watch.mockRejectedValue(redisDownError);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await expect(repository.mutate('org-1', 'user-1', mutator)).rejects.toBe(
        redisDownError,
      );
      expect(mutator).not.toHaveBeenCalled();
      // for-loop dừng NGAY ở lần watch() đầu tiên bị reject — không có cơ chế catch/retry nội bộ
      // nào nuốt lỗi kết nối rồi thử lại 5 lần (khác hẳn nhánh EXEC===null, vốn CỐ Ý retry).
      expect(redis.watch).toHaveBeenCalledTimes(1);
    });

    it('mutate() reject nguyên vẹn khi GET thất bại giữa chừng (sau WATCH thành công)', async () => {
      redis.watch.mockResolvedValue('OK');
      redis.get.mockRejectedValue(redisDownError);
      const mutator = jest.fn().mockReturnValue(nextCart);

      await expect(repository.mutate('org-1', 'user-1', mutator)).rejects.toBe(
        redisDownError,
      );
      expect(mutator).not.toHaveBeenCalled();
    });
  });
});
