import { Inject, Injectable } from '@nestjs/common';
import { isSubscriptionExpired } from '../../organization/domain/policies/subscription-lifecycle-policy';
import { CommercialFeature } from '../domain/policies/commercial-features';
import { parseEntitlementOverrides } from '../domain/policies/entitlement-overrides';
import {
  resolveEffectiveFeatures,
  TRIAL_ONLY_FEATURES,
} from '../domain/policies/plan-entitlements';
import {
  ENTITLEMENT_SUBSCRIPTION_READER,
  EntitlementSubscriptionSnapshot,
} from '../domain/repositories/entitlement-subscription-reader.interface';
import type { IEntitlementSubscriptionReader } from '../domain/repositories/entitlement-subscription-reader.interface';

/**
 * T053.03 §6 — Resolution service duy nhất cho "Plan X có bao gồm feature Y không". Không controller
 * nào được tự tính toán entitlement — luôn đi qua đây.
 *
 * §27.8 — Subscription bị thiếu/hỏng KHÔNG BAO GIỜ mặc định thành unrestricted access — fail-closed
 * về tập rỗng (không feature nào được bật), không suy diễn thành FREE hay ENTERPRISE.
 */
@Injectable()
export class EntitlementService {
  constructor(
    @Inject(ENTITLEMENT_SUBSCRIPTION_READER)
    private readonly reader: IEntitlementSubscriptionReader,
  ) {}

  async getEffectiveFeatures(
    organizationId: string,
  ): Promise<CommercialFeature[]> {
    const snapshot = await this.reader.findByOrganizationId(organizationId);
    if (!snapshot) return [];
    return Array.from(this.resolveEffective(snapshot));
  }

  async hasFeature(
    organizationId: string,
    feature: CommercialFeature,
  ): Promise<boolean> {
    const snapshot = await this.reader.findByOrganizationId(organizationId);
    if (!snapshot) return false;
    return this.resolveEffective(snapshot).has(feature);
  }

  /**
   * T053.06F Architect Decision §1/§5 — TRIAL hết hạn (persisted `EXPIRED` HOẶC còn `ACTIVE`
   * nhưng đã quá `expiredAt` — request-time fail-safe, `isSubscriptionExpired()`) resolve như
   * FREE, KHÔNG như TRIAL, KHÔNG rỗng toàn bộ. `plan` trên DB VẪN giữ nguyên `TRIAL` (§1 —
   * KHÔNG được convert TRIAL → FREE trên dữ liệu) — chỉ ORCHESTRATION ở đây đọc plan hiệu lực là
   * FREE cho mục đích tính entitlement, không ghi lại bất cứ đâu.
   *
   * `entitlementOverrides` vẫn áp dụng như bình thường trên baseline FREE (không tắt toàn bộ cơ
   * chế override) — NHƯNG bất kỳ feature nào thuộc `TRIAL_ONLY_FEATURES` đều bị loại khỏi kết quả
   * cuối cùng vô điều kiện, kể cả khi override cũ (từ trước khi hết hạn) từng bật nó — "no
   * TRIAL-only expansion from legacy overrides" (khóa chính sách, không suy diễn thêm).
   */
  private resolveEffective(
    snapshot: EntitlementSubscriptionSnapshot,
  ): Set<CommercialFeature> {
    const overrides = parseEntitlementOverrides(snapshot.entitlementOverrides);
    if (isSubscriptionExpired(snapshot)) {
      const effective = resolveEffectiveFeatures('FREE', overrides);
      for (const feature of TRIAL_ONLY_FEATURES) {
        effective.delete(feature);
      }
      return effective;
    }
    return resolveEffectiveFeatures(snapshot.plan, overrides);
  }
}
