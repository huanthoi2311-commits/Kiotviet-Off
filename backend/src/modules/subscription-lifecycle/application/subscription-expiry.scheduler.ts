import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * T053.06F Architect Implementation Authorization §10/§11 — Cron HÀNG GIỜ (không có chính sách
 * cadence nào khác đã được thiết lập trong dự án; §10 cho phép HOURLY như mặc định kiến trúc,
 * KHÔNG chạy mỗi phút, KHÔNG tạo 1 delayed job/tenant).
 *
 * Đây là "convergence/persistence machinery" — KHÔNG phải biên bảo mật/thương mại (§4): đúng
 * nghĩa vụ, đúng entitlement/quota ĐÃ được đảm bảo NGAY LẬP TỨC bởi request-time fail-safe
 * (`isSubscriptionExpired()` trong `EntitlementService`/`UsageLimitService`) — scheduler chỉ làm
 * hội tụ trạng thái persisted về đúng thực tế, không phải điều kiện TIÊN QUYẾT để thực thi đúng.
 *
 * Handler KHÔNG chứa logic nghiệp vụ (§10: "Do not put business logic directly in the Cron
 * decorator method") — chỉ ủy quyền cho `SubscriptionLifecycleService`, CÙNG service dùng trong
 * test (§22: gọi trực tiếp handler, không chờ wall-clock Cron thật).
 */
@Injectable()
export class SubscriptionExpiryScheduler {
  constructor(
    private readonly lifecycleService: SubscriptionLifecycleService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiryTick(): Promise<void> {
    await this.lifecycleService.expireDueTrials();
  }
}
