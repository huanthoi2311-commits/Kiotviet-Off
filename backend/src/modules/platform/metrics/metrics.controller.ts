import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../organization/presentation/guards/platform-admin.guard';
import { MetricsEnabledGuard } from './metrics-enabled.guard';
import { metricsRegistry } from './metrics.registry';

/**
 * SPEC-T023 Finding 4 (FR4.1) — endpoint /metrics dạng Prometheus exposition format, KHÔNG kéo
 * theo Prometheus/Grafana hay bất kỳ service mới nào (IC4.1) — chỉ trả về snapshot số liệu trong
 * tiến trình hiện tại. Tách biệt hoàn toàn khỏi `/health` (IC4.3) — health = up/down phụ thuộc,
 * metrics = số liệu.
 *
 * Architect Decision (T032.01E) — endpoint KHÔNG được public: mặc định tắt
 * (METRICS_ENABLED=false), khi bật chỉ Platform Admin mới truy cập được, không có truy cập ẩn
 * danh. Thứ tự guard CỐ Ý: MetricsEnabledGuard trước, JwtAuthGuard/PlatformAdminGuard sau — khi
 * tắt, mọi người gọi (kể cả đã đăng nhập) đều nhận 404 như route không tồn tại.
 */
@ApiExcludeController()
@SkipThrottle()
@UseGuards(MetricsEnabledGuard, JwtAuthGuard, PlatformAdminGuard)
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', metricsRegistry.contentType)
  async getMetrics(): Promise<string> {
    return metricsRegistry.metrics();
  }
}
