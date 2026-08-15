import { OrganizationPlan } from '../../../organization/domain/entities/organization.entity';

/**
 * T053.03 §7 — Read port hẹp, chỉ đọc đúng 3 cột cần cho entitlement resolution. KHÔNG phụ thuộc
 * IOrganizationRepository/OrganizationModule (SPEC-ORG-001 §3 chỉ cấm GHI trực tiếp vào
 * OrganizationSubscription từ module khác, đọc hẹp qua read port riêng là an toàn) — tránh vòng lặp
 * module RbacModule → EntitlementModule → OrganizationModule → RbacModule.
 */
export interface EntitlementSubscriptionSnapshot {
  plan: OrganizationPlan;
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
