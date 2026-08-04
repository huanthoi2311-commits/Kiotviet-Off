import {
  buildBullMqConnectionOptions,
  buildGeneralRedisOptions,
  describeRedisConnectionForLogging,
} from './redis-options.util';

const LOCAL_DEV = { host: 'localhost', port: 6379 };
const PRODUCTION_LIKE = {
  host: 'redis.internal.example.com',
  port: 6380,
  password: 'S3cretPassw0rd!',
};

describe('redis-options.util — T030.9', () => {
  describe('buildGeneralRedisOptions()', () => {
    it('[1] local development — giữ nguyên host/port/password mặc định (T030 Hybrid), không password', () => {
      const options = buildGeneralRedisOptions(LOCAL_DEV);
      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.password).toBeUndefined();
    });

    it('[2] production-like — host/port/password tùy chỉnh được giữ nguyên', () => {
      const options = buildGeneralRedisOptions(PRODUCTION_LIKE);
      expect(options.host).toBe('redis.internal.example.com');
      expect(options.port).toBe(6380);
      expect(options.password).toBe('S3cretPassw0rd!');
    });

    it('[3] connectTimeout bounded thấp hơn NHIỀU mặc định ioredis (10000ms) — nguyên nhân gốc đã xác nhận của độ trễ >30s khi Redis down', () => {
      const options = buildGeneralRedisOptions(LOCAL_DEV);
      expect(options.connectTimeout).toBeLessThan(10000);
      expect(options.connectTimeout).toBeGreaterThan(0);
    });

    it('[4] maxRetriesPerRequest là số nguyên dương hữu hạn (bounded, KHÔNG null/infinite)', () => {
      const options = buildGeneralRedisOptions(LOCAL_DEV);
      expect(typeof options.maxRetriesPerRequest).toBe('number');
      expect(options.maxRetriesPerRequest).toBeGreaterThan(0);
      expect(Number.isFinite(options.maxRetriesPerRequest as number)).toBe(
        true,
      );
    });

    it('[5] retryStrategy trả về 1 số hữu hạn, TĂNG DẦN nhưng có trần (bounded reconnect delay, quan sát được)', () => {
      const options = buildGeneralRedisOptions(LOCAL_DEV);
      const strategy = options.retryStrategy as (times: number) => number;
      const delay1 = strategy(1);
      const delay10 = strategy(10);
      const delay1000 = strategy(1000);
      expect(delay1).toBeGreaterThan(0);
      expect(delay10).toBeGreaterThanOrEqual(delay1);
      // Trần rõ ràng — số lần thử rất lớn (1000) vẫn cho cùng độ trễ tối đa như 10, không tăng vô hạn.
      expect(delay1000).toBe(delay10);
      expect(delay1000).toBeLessThanOrEqual(2000);
    });
  });

  describe('buildBullMqConnectionOptions()', () => {
    it('[6] host/port/password giữ nguyên, GIỐNG buildGeneralRedisOptions (cùng 1 nguồn cấu hình)', () => {
      const options = buildBullMqConnectionOptions(PRODUCTION_LIKE);
      expect(options.host).toBe('redis.internal.example.com');
      expect(options.port).toBe(6380);
      expect(options.password).toBe('S3cretPassw0rd!');
    });

    it('[7] KHÔNG đặt maxRetriesPerRequest — BullMQ tự ép về null cho connection blocking, đặt giá trị khác ở đây sẽ bị BullMQ ghi đè kèm cảnh báo console.error không cần thiết (xác nhận qua node_modules/bullmq/dist/cjs/classes/redis-connection.js)', () => {
      const options = buildBullMqConnectionOptions(PRODUCTION_LIKE);
      expect('maxRetriesPerRequest' in options).toBe(false);
    });

    it('[8] connectTimeout GIỐNG general client — cùng mục tiêu "fail fast" khi Redis down, dù retry contract tổng thể khác nhau', () => {
      const general = buildGeneralRedisOptions(PRODUCTION_LIKE);
      const bullmq = buildBullMqConnectionOptions(PRODUCTION_LIKE);
      expect(bullmq.connectTimeout).toBe(general.connectTimeout);
    });
  });

  describe('describeRedisConnectionForLogging()', () => {
    it('[9] KHÔNG BAO GIỜ chứa giá trị password thật trong chuỗi log', () => {
      const description = describeRedisConnectionForLogging(PRODUCTION_LIKE);
      expect(description).not.toContain(PRODUCTION_LIKE.password);
      expect(description).toContain('password: set');
    });

    it('[10] báo "password: none" khi không có password (dev mặc định)', () => {
      const description = describeRedisConnectionForLogging(LOCAL_DEV);
      expect(description).toContain('password: none');
    });

    it('[11] vẫn hiện host:port (thông tin không nhạy cảm) để log còn hữu ích', () => {
      const description = describeRedisConnectionForLogging(PRODUCTION_LIKE);
      expect(description).toContain('redis.internal.example.com:6380');
    });
  });
});
