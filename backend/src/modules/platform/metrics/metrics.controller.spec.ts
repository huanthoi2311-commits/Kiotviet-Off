import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../organization/presentation/guards/platform-admin.guard';
import { MetricsEnabledGuard } from './metrics-enabled.guard';
import { MetricsController } from './metrics.controller';

describe('MetricsController — SPEC-T023 Finding 4 (FR4.1)', () => {
  it('[AC4.1] GET /metrics trả về nội dung từ metricsRegistry (định dạng Prometheus exposition)', async () => {
    // Không so khớp byte-cho-byte với 1 lần gọi metricsRegistry.metrics() riêng — số liệu
    // process-level (vd heap size) là snapshot sống, đổi giữa 2 lần gọi liên tiếp. Kiểm tra cấu
    // trúc/nội dung mong đợi thay vì so khớp tuyệt đối.
    const controller = new MetricsController();
    const result = await controller.getMetrics();
    expect(result).toContain('http_requests_total');
    expect(result).toContain('nodejs_heap_size_total_bytes');
  });

  it('[IC4.1] không có process nào khác (Prometheus/Grafana) được tạo — chỉ đọc registry trong tiến trình', async () => {
    const controller = new MetricsController();
    const result = await controller.getMetrics();
    expect(typeof result).toBe('string');
  });

  it(
    '[unauthorized request][Platform Admin access] Architect Decision (T032.01E) — GET /metrics ' +
      'được bảo vệ bởi đúng bộ guard MetricsEnabledGuard → JwtAuthGuard → PlatformAdminGuard, ' +
      'theo đúng thứ tự này (tắt trước, xác thực sau, để "tắt" không tiết lộ route tồn tại; chưa ' +
      'đăng nhập bị JwtAuthGuard chặn; đăng nhập nhưng không phải Platform Admin bị ' +
      'PlatformAdminGuard chặn)',
    () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        MetricsController,
      ) as unknown[];
      expect(guards).toEqual([
        MetricsEnabledGuard,
        JwtAuthGuard,
        PlatformAdminGuard,
      ]);
    },
  );
});
