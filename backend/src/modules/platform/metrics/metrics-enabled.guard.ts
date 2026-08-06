import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Architect Decision (T032.01E) — /metrics KHÔNG được public. Mặc định METRICS_ENABLED=false, và
 * khi tắt, endpoint phải "không tồn tại" (404), không phải 401/403 — trả 401/403 vẫn tiết lộ route
 * có thật. Guard này đứng ĐẦU TIÊN trong @UseGuards() của MetricsController, trước
 * JwtAuthGuard/PlatformAdminGuard, để hành vi "tắt" áp dụng bất kể trạng thái đăng nhập của người
 * gọi.
 */
@Injectable()
export class MetricsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get<boolean>('metrics.enabled')) {
      throw new NotFoundException();
    }
    return true;
  }
}
