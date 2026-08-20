import Redis from 'ioredis';
import { RedisOtpRepository } from './redis-otp.repository';

/**
 * T030.9 — module RedisOtpRepository trước đây KHÔNG có spec nào (xác nhận qua Mandatory Source
 * Verification — không tìm thấy file *.spec.ts nào khớp "*otp*" trong toàn bộ backend/src trước
 * package này). File này lấp khoảng trống đó, tập trung vào yêu cầu bảo mật cốt lõi của T030.9:
 * "OTP Redis failure does not bypass security" — mọi method đọc/ghi Redis khi Redis lỗi PHẢI
 * reject (không bao giờ âm thầm trả về 1 giá trị "an toàn giả" như false/0/null mà lẽ ra phải là
 * lỗi thật, vì điều đó có thể bị hiểu nhầm thành "chưa verify"/"chưa gửi" thay vì "không biết").
 */
describe('RedisOtpRepository — T030.9 / T053.06B-1', () => {
  let repository: RedisOtpRepository;
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    ttl: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
    eval: jest.Mock;
  };

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      eval: jest.fn(),
    };
    repository = new RedisOtpRepository(redis as unknown as Redis);
  });

  describe('happy path — hành vi hiện có không đổi', () => {
    it('save() ghi OTP hash kèm TTL 300s và xóa cờ verified cũ', async () => {
      redis.set.mockResolvedValue('OK');
      redis.del.mockResolvedValue(1);
      await repository.save('org:a@b.com', 'hash123');
      expect(redis.set).toHaveBeenCalledWith(
        'auth:otp:org:a@b.com',
        JSON.stringify({ otpHash: 'hash123', attempts: 0 }),
        'EX',
        300,
      );
      expect(redis.del).toHaveBeenCalledWith('auth:otp:verified:org:a@b.com');
    });

    it('get() trả về null khi không có bản ghi', async () => {
      redis.get.mockResolvedValue(null);
      await expect(repository.get('org:a@b.com')).resolves.toBeNull();
    });

    it('isVerified() trả true chỉ khi giá trị đúng "1"', async () => {
      redis.get.mockResolvedValue('1');
      await expect(repository.isVerified('org:a@b.com')).resolves.toBe(true);
    });

    it('isVerified() trả false khi key không tồn tại (get trả null)', async () => {
      redis.get.mockResolvedValue(null);
      await expect(repository.isVerified('org:a@b.com')).resolves.toBe(false);
    });

    it('incrementSendCount() set TTL 3600s CHỈ ở lần đầu (count === 1)', async () => {
      redis.incr.mockResolvedValue(1);
      redis.expire.mockResolvedValue(1);
      const count = await repository.incrementSendCount('org:a@b.com');
      expect(count).toBe(1);
      expect(redis.expire).toHaveBeenCalledWith(
        'auth:otp:sendcount:org:a@b.com',
        3600,
      );
    });

    it('incrementSendCount() KHÔNG set lại TTL ở các lần sau (count > 1)', async () => {
      redis.incr.mockResolvedValue(2);
      await repository.incrementSendCount('org:a@b.com');
      expect(redis.expire).not.toHaveBeenCalled();
    });

    it('getCooldownRemainingSeconds() trả 0 khi không còn cooldown (ttl <= 0)', async () => {
      redis.ttl.mockResolvedValue(-2);
      await expect(
        repository.getCooldownRemainingSeconds('org:a@b.com'),
      ).resolves.toBe(0);
    });

    it('incrementVerifyAttemptWindowCount() set TTL 3600s CHỈ ở lần đầu (count === 1), cùng mẫu incrementSendCount()', async () => {
      redis.incr.mockResolvedValue(1);
      redis.expire.mockResolvedValue(1);
      const count =
        await repository.incrementVerifyAttemptWindowCount('org:a@b.com');
      expect(count).toBe(1);
      expect(redis.expire).toHaveBeenCalledWith(
        'auth:otp:verifywindow:org:a@b.com',
        3600,
      );
    });

    it('incrementVerifyAttemptWindowCount() KHÔNG set lại TTL ở các lần sau (count > 1)', async () => {
      redis.incr.mockResolvedValue(2);
      await repository.incrementVerifyAttemptWindowCount('org:a@b.com');
      expect(redis.expire).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndConsume() — T053.06B-1 (typed outcome + EVAL call shape)', () => {
    it('gọi EVAL với đúng script/keys/args', async () => {
      redis.eval.mockResolvedValue(['OK']);
      await repository.verifyAndConsume('org:a@b.com', 'hash123', 5);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        2,
        'auth:otp:org:a@b.com',
        'auth:otp:verified:org:a@b.com',
        'hash123',
        '5',
        '300',
        '300',
      );
    });

    it('parse outcome OK', async () => {
      redis.eval.mockResolvedValue(['OK']);
      await expect(
        repository.verifyAndConsume('org:a@b.com', 'hash123', 5),
      ).resolves.toEqual({ outcome: 'OK' });
    });

    it('parse outcome NOT_FOUND', async () => {
      redis.eval.mockResolvedValue(['NOT_FOUND']);
      await expect(
        repository.verifyAndConsume('org:a@b.com', 'hash123', 5),
      ).resolves.toEqual({ outcome: 'NOT_FOUND' });
    });

    it('parse outcome MAX_ATTEMPTS', async () => {
      redis.eval.mockResolvedValue(['MAX_ATTEMPTS']);
      await expect(
        repository.verifyAndConsume('org:a@b.com', 'hash123', 5),
      ).resolves.toEqual({ outcome: 'MAX_ATTEMPTS' });
    });

    it('parse outcome INCORRECT kèm attempts (chuyển từ string sang number)', async () => {
      redis.eval.mockResolvedValue(['INCORRECT', '3']);
      await expect(
        repository.verifyAndConsume('org:a@b.com', 'hash123', 5),
      ).resolves.toEqual({ outcome: 'INCORRECT', attempts: 3 });
    });

    it('T053.06B-1 (§12) — outcome KHÔNG xác định từ Lua PHẢI fail closed (ném lỗi, không âm thầm coi là bất kỳ outcome nào)', async () => {
      redis.eval.mockResolvedValue(['SOMETHING_UNEXPECTED']);
      await expect(
        repository.verifyAndConsume('org:a@b.com', 'hash123', 5),
      ).rejects.toThrow(/kết quả Lua không xác định/);
    });
  });

  describe('Redis lỗi/không khả dụng — KHÔNG được bypass bảo mật (T030.9, AD-5)', () => {
    const redisDownError = new Error('connect ECONNREFUSED 127.0.0.1:6379');

    it('isVerified() reject nguyên vẹn khi Redis lỗi — KHÔNG âm thầm trả về false/true', async () => {
      redis.get.mockRejectedValue(redisDownError);
      await expect(repository.isVerified('org:a@b.com')).rejects.toBe(
        redisDownError,
      );
    });

    it('get() (đọc OTP hash để so khớp verifyOtp) reject nguyên vẹn khi Redis lỗi', async () => {
      redis.get.mockRejectedValue(redisDownError);
      await expect(repository.get('org:a@b.com')).rejects.toBe(redisDownError);
    });

    it('save() reject nguyên vẹn khi Redis lỗi — không báo "đã gửi OTP" giả', async () => {
      redis.set.mockRejectedValue(redisDownError);
      await expect(repository.save('org:a@b.com', 'hash123')).rejects.toBe(
        redisDownError,
      );
    });

    it('verifyAndConsume() reject nguyên vẹn khi Redis lỗi (EVAL thất bại — không nuốt lỗi thành bất kỳ outcome nào)', async () => {
      redis.eval.mockRejectedValue(redisDownError);
      await expect(
        repository.verifyAndConsume('org:a@b.com', 'hash123', 5),
      ).rejects.toBe(redisDownError);
    });

    it('incrementVerifyAttemptWindowCount() reject nguyên vẹn khi Redis lỗi — không âm thầm cho phép verify không giới hạn', async () => {
      redis.incr.mockRejectedValue(redisDownError);
      await expect(
        repository.incrementVerifyAttemptWindowCount('org:a@b.com'),
      ).rejects.toBe(redisDownError);
    });

    it('incrementSendCount() reject nguyên vẹn khi Redis lỗi — không âm thầm cho phép gửi không giới hạn', async () => {
      redis.incr.mockRejectedValue(redisDownError);
      await expect(repository.incrementSendCount('org:a@b.com')).rejects.toBe(
        redisDownError,
      );
    });

    it('getCooldownRemainingSeconds() reject nguyên vẹn khi Redis lỗi — không âm thầm báo "hết cooldown"', async () => {
      redis.ttl.mockRejectedValue(redisDownError);
      await expect(
        repository.getCooldownRemainingSeconds('org:a@b.com'),
      ).rejects.toBe(redisDownError);
    });

    it('startCooldown() reject nguyên vẹn khi Redis lỗi', async () => {
      redis.set.mockRejectedValue(redisDownError);
      await expect(repository.startCooldown('org:a@b.com')).rejects.toBe(
        redisDownError,
      );
    });

    it('delete() reject nguyên vẹn khi Redis lỗi', async () => {
      redis.del.mockRejectedValue(redisDownError);
      await expect(repository.delete('org:a@b.com')).rejects.toBe(
        redisDownError,
      );
    });
  });
});
