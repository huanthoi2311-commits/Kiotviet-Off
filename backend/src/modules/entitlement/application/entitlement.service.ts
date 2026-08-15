import { Inject, Injectable } from '@nestjs/common';
import { CommercialFeature } from '../domain/policies/commercial-features';
import { parseEntitlementOverrides } from '../domain/policies/entitlement-overrides';
import { resolveEffectiveFeatures } from '../domain/policies/plan-entitlements';
import { ENTITLEMENT_SUBSCRIPTION_READER } from '../domain/repositories/entitlement-subscription-reader.interface';
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
    const overrides = parseEntitlementOverrides(snapshot.entitlementOverrides);
    return Array.from(resolveEffectiveFeatures(snapshot.plan, overrides));
  }

  async hasFeature(
    organizationId: string,
    feature: CommercialFeature,
  ): Promise<boolean> {
    const snapshot = await this.reader.findByOrganizationId(organizationId);
    if (!snapshot) return false;
    const overrides = parseEntitlementOverrides(snapshot.entitlementOverrides);
    return resolveEffectiveFeatures(snapshot.plan, overrides).has(feature);
  }
}
