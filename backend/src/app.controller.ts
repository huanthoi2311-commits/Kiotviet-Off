import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import Redis from 'ioredis';
import { getRequestId } from './common/context/request-context';
import { PrismaService } from './prisma/prisma.service';
import { REDIS_CLIENT } from './redis/redis.constants';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * T027.7 (SPEC-T027-SystemIntegration-Recovery-v2 §11) — dùng `@Res()` (không
   * `passthrough`) để tự kiểm soát response, bỏ qua TransformInterceptor/HttpExceptionFilter
   * mặc định, vì hai cơ chế đó không giữ được payload health khi degraded (filter chỉ trích
   * `code`/`message` từ exception, bỏ hết các field khác). Envelope trả về vẫn giống hệt cấu
   * trúc mà TransformInterceptor tạo ra — chỉ HTTP status code khác nhau (200/503).
   */
  @Get()
  async check(@Res() res: Response): Promise<void> {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      this.redis
        .ping()
        .then(() => 'up')
        .catch(() => 'down'),
    ]);

    const status = database === 'up' && redis === 'up' ? 'ok' : 'degraded';

    res.status(status === 'ok' ? 200 : 503).json({
      success: true,
      data: {
        status,
        uptime: process.uptime(),
        dependencies: { database, redis },
      },
      meta: null,
      traceId: getRequestId() ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}
