import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsEnabledGuard } from './metrics-enabled.guard';

describe('MetricsEnabledGuard — Architect Decision (T032.01E)', () => {
  function makeGuard(enabled: boolean): MetricsEnabledGuard {
    const config = {
      get: jest.fn().mockReturnValue(enabled),
    } as unknown as ConfigService;
    return new MetricsEnabledGuard(config);
  }

  it('[disabled metrics] METRICS_ENABLED=false (mặc định) → ném NotFoundException, endpoint coi như không tồn tại', () => {
    const guard = makeGuard(false);
    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('[enabled metrics] METRICS_ENABLED=true → cho qua để JwtAuthGuard/PlatformAdminGuard tiếp tục kiểm tra', () => {
    const guard = makeGuard(true);
    expect(guard.canActivate()).toBe(true);
  });
});
