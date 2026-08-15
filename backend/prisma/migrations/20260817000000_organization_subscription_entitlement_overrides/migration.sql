-- T053.03 Feature Entitlements Foundation
-- Bo sung cot entitlementOverrides (Json, nullable) cho OrganizationSubscription — luu ghi de
-- entitlement rieng theo tung Organization. Thuan tuy them moi (additive) - khong doi kieu du lieu
-- cot nao khac, khong anh huong bat ky row OrganizationSubscription hien co nao (moi row hien co se
-- nhan entitlementOverrides = NULL, nghia la dung nguyen default cua Plan, khong doi hanh vi).

ALTER TABLE "organization_subscriptions" ADD COLUMN "entitlementOverrides" JSONB;
