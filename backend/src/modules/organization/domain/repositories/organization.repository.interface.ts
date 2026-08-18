import type { Prisma } from '@prisma/client';
import {
  OrganizationAggregate,
  OrganizationEntity,
  OrganizationPlan,
  OrganizationStatus,
} from '../entities/organization.entity';

export interface CreateOrganizationWithOwnerInput {
  code: string;
  displayName: string;
  legalName?: string | null;
  slug: string;
  taxCode?: string | null;
  owner: {
    username: string;
    fullName: string;
    email: string;
    passwordHash: string;
  };
  /** T053.02 — Plan thương mại được chọn khi tạo Organization. Bỏ trống → giữ NGUYÊN hành vi cũ
   * (FREE, do repository áp dụng mặc định — không phải do schema `@default` một mình quyết định
   * nữa, vì giới hạn tài nguyên theo Plan giờ do `computeSubscriptionDefaults()` tính tường minh). */
  plan?: OrganizationPlan;
}

export interface UpdateOrganizationInput {
  displayName?: string;
  legalName?: string | null;
  taxCode?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  countryCode?: string;
  timezone?: string;
  currencyCode?: string;
  languageCode?: string;
  updatedBy: string;
}

export interface OrganizationSearchParams {
  search?: string;
  status?: OrganizationStatus;
  page: number;
  limit: number;
}

export interface OrganizationSearchResult {
  items: OrganizationEntity[];
  total: number;
  page: number;
  limit: number;
}

/** Audit context — Audit Log là 1 bước BẮT BUỘC trong transaction tạo Organization (SPEC-ORG-001 §17). */
export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
  /** T053.04 D16 — mặc định `'organization.created'` (Platform Admin, hành vi cũ, KHÔNG đổi) khi
   * bỏ trống. `TrialSignupService` truyền `'organization.trial_signup'` — action riêng biệt để
   * audit trail phân biệt được tổ chức tạo qua self-service signup với tổ chức Platform Admin tạo. */
  action?: string;
  /** T053.04 — merge thêm vào `AuditLog.newValue` (vd `{ provisionedVia: 'public_trial_signup' }`).
   * KHÔNG BAO GIỜ chứa password/OTP/token — chỉ metadata provisioning không nhạy cảm. */
  extraAuditMetadata?: Record<string, unknown>;
}

export class OrganizationSlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`Slug "${slug}" đã được sử dụng`);
  }
}

export class OrganizationTaxCodeConflictError extends Error {
  constructor(public readonly taxCode: string) {
    super(`Mã số thuế "${taxCode}" đã được sử dụng`);
  }
}

export class OrganizationEmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(`Email "${email}" đã được sử dụng`);
  }
}

export class OrganizationNotActiveError extends Error {
  constructor(public readonly id: string) {
    super('Tổ chức không ở trạng thái hoạt động');
  }
}

export class OrganizationOwnerNotInOrganizationError extends Error {
  constructor(public readonly userId: string) {
    super('Người dùng không thuộc tổ chức này, không thể trở thành Owner');
  }
}

/**
 * SPEC-ORG-001 §3: Organization là Aggregate Root — không module nào được ghi trực tiếp vào
 * OrganizationSettings/OrganizationSubscription, chỉ qua repository này.
 */
export interface IOrganizationRepository {
  /**
   * Tạo Organization + Owner User + Owner Role (toàn quyền) + UserRole + OrganizationSettings +
   * OrganizationSubscription + Audit Log trong 1 transaction duy nhất (SPEC-ORG-001 Decision 3,
   * §17) — rollback toàn bộ nếu bất kỳ bước nào lỗi.
   */
  createWithOwner(
    input: CreateOrganizationWithOwnerInput,
    actorUserId: string,
    auditContext: AuditContext,
  ): Promise<OrganizationAggregate>;
  /**
   * T053.04 D8 — biến thể transaction-composable của `createWithOwner()`: chạy ĐÚNG cùng logic
   * 9-bước-ghi (không nhân bản), nhưng dùng `tx` do CALLER truyền vào thay vì tự mở
   * `$transaction` riêng — cho phép caller (vd `TrialSignupService`) gộp việc tiêu thụ signup
   * proof + provisioning Organization vào 1 Business Transaction duy nhất (Architect Decision D8
   * — "hai transaction liền kề KHÔNG được chấp nhận"). `actorUserId: string | null` — public
   * self-service signup KHÔNG có actor xác thực nào (không được bịa ra một actor giả — Architect
   * Decision D10), khác `createWithOwner()` (actor luôn có thật, Platform Admin). KHÔNG thay đổi
   * hành vi/chữ ký của `createWithOwner()` — Platform Admin provisioning giữ nguyên 100%.
   */
  createWithOwnerInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateOrganizationWithOwnerInput,
    actorUserId: string | null,
    auditContext: AuditContext,
  ): Promise<OrganizationAggregate>;
  findById(id: string): Promise<OrganizationAggregate | null>;
  findBySlug(slug: string): Promise<OrganizationEntity | null>;
  search(params: OrganizationSearchParams): Promise<OrganizationSearchResult>;
  update(
    id: string,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationEntity>;
  /** Ném OrganizationNotActiveError nếu Organization đã ARCHIVED từ trước. */
  archive(id: string, archivedBy: string): Promise<OrganizationEntity>;
  /** Ném OrganizationOwnerNotInOrganizationError nếu newOwnerUserId không thuộc Organization này. */
  transferOwner(
    id: string,
    newOwnerUserId: string,
    updatedBy: string,
  ): Promise<OrganizationEntity>;
  existsBySlug(slug: string): Promise<boolean>;
  existsByTaxCode(taxCode: string): Promise<boolean>;
  existsByEmail(email: string): Promise<boolean>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
