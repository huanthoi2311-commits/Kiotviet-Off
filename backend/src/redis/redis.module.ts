import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  buildGeneralRedisOptions,
  describeRedisConnectionForLogging,
} from '../config/redis-options.util';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('RedisModule');
        const connection = {
          host: config.get<string>('redis.host')!,
          port: config.get<number>('redis.port')!,
          password: config.get<string>('redis.password'),
        };
        // T030.9 — factory canonical DUY NHẤT cho options kết nối Redis (bounded connectTimeout/
        // retry, xem redis-options.util.ts) — không còn tự khai literal options ở đây.
        const client = new Redis(buildGeneralRedisOptions(connection));
        const safeDescription = describeRedisConnectionForLogging(connection);
        client.on('connect', () =>
          logger.log(`Redis connected: ${safeDescription}`),
        );
        // T030.9 — 'reconnecting' làm hành vi retry QUAN SÁT ĐƯỢC (yêu cầu chỉ đạo), không chỉ
        // âm thầm chờ; KHÔNG log password (safeDescription đã che).
        client.on('reconnecting', (delayMs: number) =>
          logger.warn(
            `Redis reconnecting sau ${delayMs}ms tới ${safeDescription}`,
          ),
        );
        // T030.9 — bắt buộc phải có listener 'error' (ioredis/Node EventEmitter mặc định NÉM lỗi
        // ra ngoài, có thể crash tiến trình, nếu sự kiện 'error' không ai lắng nghe) — GIỮ NGUYÊN
        // hành vi đã có từ trước, chỉ thêm địa chỉ an toàn vào message, không đổi log level/kênh.
        client.on('error', (err) =>
          logger.error(`Redis error (${safeDescription}): ${err.message}`),
        );
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);
  private shutdownCalled = false;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * T030.9 — idempotent: Nest chỉ gọi hook này 1 lần mỗi lần shutdown trong vận hành bình thường,
   * nhưng chỉ đạo yêu cầu tường minh "repeated shutdown hooks are idempotent or safely handled" —
   * cờ `shutdownCalled` đảm bảo `quit()` không bao giờ được gọi 2 lần dù bị trigger nhiều lần
   * (test, lifecycle bất thường...). `quit()` (không phải `disconnect()`) được chọn vì đây là
   * đường tắt sạch — cố gắng gửi hết lệnh đang chờ trước khi đóng; nếu Redis không kết nối được
   * ngay từ đầu, `quit()` vẫn resolve (ioredis tự xử lý, không throw) thay vì treo.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.shutdownCalled) {
      return;
    }
    this.shutdownCalled = true;
    try {
      await this.client.quit();
    } catch (error) {
      // T030.9 — quit() có thể reject nếu client chưa từng kết nối được (vd Redis down suốt vòng
      // đời app) — KHÔNG để lỗi này chặn phần còn lại của shutdown sequence (Prisma, BullMQ...).
      this.logger.warn(
        `Redis quit() gặp lỗi khi shutdown (bỏ qua, không chặn shutdown): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
