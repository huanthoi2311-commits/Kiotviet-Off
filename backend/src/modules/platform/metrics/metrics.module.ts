import { Module } from '@nestjs/common';
import { MetricsEnabledGuard } from './metrics-enabled.guard';
import { MetricsController } from './metrics.controller';

@Module({
  controllers: [MetricsController],
  providers: [MetricsEnabledGuard],
})
export class MetricsModule {}
