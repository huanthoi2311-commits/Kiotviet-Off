import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
} from '../../organization/domain/repositories/organization.repository.interface';

/**
 * T053.06F Architect Implementation Authorization §10/§14 — dịch vụ hẹp DUY NHẤT cho vòng đời
 * hết hạn Subscription. Gọi qua ĐÚNG repository "cửa ngõ ghi duy nhất" đã có
 * (`IOrganizationRepository.expireDueTrials()`, SPEC-ORG-001 §3) — KHÔNG tự mở writer thứ 2 vào
 * `organization_subscriptions`. Được gọi từ 2 nơi: `SubscriptionExpiryScheduler` (Cron production)
 * VÀ trực tiếp trong test — cùng 1 service, không có logic nghiệp vụ nào sống riêng trong Cron
 * handler (§10: "Do not put business logic directly in the Cron decorator method").
 */
@Injectable()
export class SubscriptionLifecycleService {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: IOrganizationRepository,
  ) {}

  /** Trả về số dòng đã chuyển ACTIVE → EXPIRED (0 là kết quả hợp lệ, không phải lỗi — §19: dòng
   * đã EXPIRED từ trước không được xử lý lại, không "resurrect"). */
  async expireDueTrials(now: Date = new Date()): Promise<number> {
    const count = await this.organizationRepository.expireDueTrials(now);
    if (count > 0) {
      this.logger.log(
        `Đã chuyển ${count} TRIAL subscription từ ACTIVE sang EXPIRED (now=${now.toISOString()})`,
      );
    }
    return count;
  }
}
