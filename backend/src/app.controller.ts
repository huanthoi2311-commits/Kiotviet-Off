import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
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

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down'),
      this.redis
        .ping()
        .then(() => 'up')
        .catch(() => 'down'),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      uptime: process.uptime(),
      dependencies: { database, redis },
    };
  }
}
