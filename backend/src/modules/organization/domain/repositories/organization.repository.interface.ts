import {
  OrganizationAggregate,
  OrganizationEntity,
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
