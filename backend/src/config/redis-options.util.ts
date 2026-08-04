import type { RedisOptions } from 'ioredis';

/**
 * T030.9 — Redis connection triplet đã được `env.validation.ts` xác thực (host là chuỗi bất kỳ,
 * port trong khoảng 1-65535, password tùy chọn) và `configuration.ts` phơi ra qua `ConfigService`.
 * File này KHÔNG tự đọc `process.env` — nhận input đã qua `ConfigService.get('redis.*')`, giữ
 * đúng 1 đường dẫn đọc biến môi trường duy nhất (không có `REDIS_URL`, đã xác nhận qua Mandatory
 * Source Verification: `configuration.ts`/`env.validation.ts`/`.env.example`/3 tài liệu môi
 * trường T030 đều CHỈ dùng REDIS_HOST/REDIS_PORT/REDIS_PASSWORD).
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
}

/**
 * T030.9 — `connectTimeout` mặc định của ioredis là 10000ms (xác nhận trực tiếp trong
 * `node_modules/ioredis/built/redis/RedisOptions.js`). Kết hợp với `maxRetriesPerRequest`, đây là
 * NGUYÊN NHÂN GỐC đã xác nhận thực nghiệm của việc 10 request tuần tự trong `auth.e2e-spec.ts`
 * từng vượt ngưỡng timeout 30s khi Redis không khả dụng (comment gốc trong file đó, dòng ~60-62) —
 * mỗi lần kết nối lại có thể chờ tới 10s trước khi ioredis coi là thất bại. Rút xuống 2000ms để
 * một lệnh Redis thất bại (Redis down) luôn trả về trong vài giây, KHÔNG BAO GIỜ kéo dài tới
 * hàng chục giây — vẫn đủ rộng rãi cho 1 kết nối thật chậm trong điều kiện bình thường.
 */
const GENERAL_CLIENT_CONNECT_TIMEOUT_MS = 2000;

/**
 * Giữ NGUYÊN giá trị đã có từ trước (`redis.module.ts`, chưa qua T030.9) — đã bounded (không phải
 * infinite retry), không có bằng chứng cần đổi; chỉ `connectTimeout` mới là nguyên nhân gốc của độ
 * trễ không xác định. Xem test `redis-options.util.spec.ts` cho hành vi chính xác.
 */
const GENERAL_CLIENT_MAX_RETRIES_PER_REQUEST = 3;

/** Độ trễ tối đa giữa 2 lần thử kết nối lại (background, KHÔNG chặn command nào) — bounded, quan sát được qua sự kiện 'reconnecting' (xem redis.module.ts). */
const GENERAL_CLIENT_MAX_RECONNECT_DELAY_MS = 2000;

/**
 * Options cho Redis client dùng chung của ứng dụng (Cart/OTP/health check) — client dùng trên
 * request path, cần thất bại NHANH và CÓ GIỚI HẠN khi Redis không khả dụng (chính sách AD-5/T030.9:
 * "Redis-backed operations must fail deterministically and promptly").
 */
export function buildGeneralRedisOptions(
  config: RedisConnectionConfig,
): RedisOptions {
  return {
    host: config.host,
    port: config.port,
    password: config.password,
    connectTimeout: GENERAL_CLIENT_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: GENERAL_CLIENT_MAX_RETRIES_PER_REQUEST,
    retryStrategy: (times: number) =>
      Math.min(times * 200, GENERAL_CLIENT_MAX_RECONNECT_DELAY_MS),
  };
}

/**
 * Options cho connection riêng của BullMQ (Queue/Worker) — CỐ Ý KHÔNG đặt `maxRetriesPerRequest`.
 * BullMQ's `RedisConnection` (xem `node_modules/bullmq/dist/cjs/classes/redis-connection.js:47-54`,
 * đọc trực tiếp khi Mandatory Source Verification) tự ép giá trị này về `null` cho mọi connection ở
 * chế độ blocking (mặc định) khi nhận 1 plain options object — cần `null` vì BullMQ dùng các lệnh
 * blocking (BRPOPLPUSH/BZPOPMIN) đợi job mới, không phải lỗi cần retry-giới-hạn. Nếu ta tự đặt
 * `maxRetriesPerRequest` khác `null`/`undefined` ở đây, BullMQ vẫn ép về `null` (không đổi hành vi
 * thật) nhưng in ra 1 dòng console.error cảnh báo mỗi lần khởi động — không có lợi gì, chỉ gây
 * nhiễu. Đây chính là lý do "Do not apply BullMQ worker options blindly to ordinary request-path
 * Redis clients" (và ngược lại) trong chỉ đạo T030.9.
 */
export function buildBullMqConnectionOptions(
  config: RedisConnectionConfig,
): Pick<RedisOptions, 'host' | 'port' | 'password' | 'connectTimeout'> {
  return {
    host: config.host,
    port: config.port,
    password: config.password,
    connectTimeout: GENERAL_CLIENT_CONNECT_TIMEOUT_MS,
  };
}

/**
 * Mô tả an toàn cho log — KHÔNG BAO GIỜ chứa giá trị `password` thật, chỉ cho biết có/không có
 * password được cấu hình. Dùng ở mọi nơi cần log thông tin kết nối Redis (connect/reconnecting/
 * error) thay vì log nguyên object options.
 */
export function describeRedisConnectionForLogging(
  config: RedisConnectionConfig,
): string {
  return `${config.host}:${config.port} (password: ${config.password ? 'set' : 'none'})`;
}
