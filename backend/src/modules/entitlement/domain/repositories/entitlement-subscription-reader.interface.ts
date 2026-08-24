import {
  OrganizationPlan,
  OrganizationSubscriptionStatus,
} from '../../../organization/domain/entities/organization.entity';

/**
 * T053.03 §7 — Read port hẹp, chỉ đọc đúng các cột cần cho entitlement resolution. KHÔNG phụ thuộc
 * IOrganizationRepository/OrganizationModule (SPEC-ORG-001 §3 chỉ cấm GHI trực tiếp vào
 * OrganizationSubscription từ module khác, đọc hẹp qua read port riêng là an toàn) — tránh vòng lặp
 * module RbacModule → EntitlementModule → OrganizationModule → RbacModule.
 *
 * T053.06F — bổ sung `status`/`expiredAt` (trước đây CỐ Ý không đọc — nay cần để tính "hiệu lực
 * hết hạn" qua `isSubscriptionExpired()`, xem `entitlement.service.ts`).
 */
export interface EntitlementSubscriptionSnapshot {
  plan: OrganizationPlan;
  status: OrganizationSubscriptionStatus;
  expiredAt: Date | null;
  entitlementOverrides: unknown;
}

export interface IEntitlementSubscriptionReader {
  findByOrganizationId(
    organizationId: string,
  ): Promise<EntitlementSubscriptionSnapshot | null>;
}

export const ENTITLEMENT_SUBSCRIPTION_READER = Symbol(
  'ENTITLEMENT_SUBSCRIPTION_READER',
);
