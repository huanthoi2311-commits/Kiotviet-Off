import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildBullMqConnectionOptions } from '../config/redis-options.util';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // T030.9 — factory canonical DUY NHẤT cho options kết nối Redis, cùng nguồn với
        // RedisModule (redis-options.util.ts) nhưng KHÔNG mang theo `maxRetriesPerRequest` của
        // client thông thường — BullMQ tự ép giá trị này về `null` cho connection blocking, xem
        // giải thích đầy đủ tại buildBullMqConnectionOptions().
        connection: buildBullMqConnectionOptions({
          host: config.get<string>('redis.host')!,
          port: config.get<number>('redis.port')!,
          password: config.get<string>('redis.password'),
        }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
