export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type OrganizationPlan = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';
export type OrganizationSubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface OrganizationEntity {
  id: string;
  code: string;
  displayName: string;
  legalName: string | null;
  slug: string;
  taxCode: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  countryCode: string;
  timezone: string;
  currencyCode: string;
  languageCode: string;
  status: OrganizationStatus;
  ownerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/// Business Setting theo Organization (SPEC-ORG-001 §8) — luôn tồn tại 1-1 sau khi Organization được tạo.
export interface OrganizationSettingsEntity {
  organizationId: string;
  allowNegativeInventory: boolean;
  allowBackDate: boolean;
  decimalQuantity: number;
  decimalPrice: number;
  defaultWarehouseId: string | null;
  defaultBranchId: string | null;
  defaultLanguage: string;
  defaultCurrency: string;
}

/// Chỉ cấu trúc — không có logic billing (SPEC-ORG-001 §9, Decision 1: Single Source of Truth cho `plan`).
export interface OrganizationSubscriptionEntity {
  organizationId: string;
  plan: OrganizationPlan;
  status: OrganizationSubscriptionStatus;
  startedAt: Date;
  expiredAt: Date | null;
  maxBranch: number | null;
  maxUser: number | null;
  maxWarehouse: number | null;
  maxProduct: number | null;
  maxCustomer: number | null;
  storageLimitGB: number | null;
}

export interface OrganizationAggregate {
  organization: OrganizationEntity;
  settings: OrganizationSettingsEntity;
  subscription: OrganizationSubscriptionEntity;
}
