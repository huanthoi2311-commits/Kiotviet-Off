import type { Prisma, PrismaClient } from '@prisma/client';
import { OrganizationPlan } from '../../organization/domain/entities/organization.entity';
import { computeSubscriptionDefaults } from '../../organization/domain/policies/subscription-plan-defaults';
import { UsageLimitService } from '../../usage-limit/application/usage-limit.service';
import {
  USAGE_RESOURCE_TYPES,
  UsageResourceType,
} from '../../usage-limit/domain/usage-resource-type';

/**
 * T053.06I — Safe Subscription Plan Change CLI (operator tool, mirror `platform-admin-promoter.ts`'s
 * pure-function/no-NestJS-DI pattern — cùng lý do: đây là script vận hành viên chạy ngoài tầng HTTP,
 * không phải business feature công khai).
 *
 * PHẠM VI: chỉ đổi `OrganizationSubscription.plan/status/expiredAt/max*` cho 1 Organization ĐÃ TỒN
 * TẠI, tương đương "commercial state snapshot" khớp đúng target plan — KHÔNG phải billing engine,
 * KHÔNG tạo invoice/payment, KHÔNG tự suspend/archive Organization.
 *
 * TARGET TRIAL BỊ CHẶN — không có ADR/SPEC nào trong repo cho phép vận hành viên đưa 1 Organization
 * ĐÃ TỒN TẠI quay lại TRIAL (xác nhận qua rà soát `docs/architecture/adr/` + toàn bộ `docs/` — không
 * có "re-trial"/"trial lại" nào được nhắc tới). Theo đúng quyết định khoá của Architect Authorization
 * T053.06I §7: KHÔNG tự phát minh chính sách trial-lại-lần-2 — chỉ hỗ trợ target ∈ {FREE, BASIC, PRO,
 * ENTERPRISE}, nguồn (source) plan bất kỳ.
 *
 * KHOÁ ĐỒNG THỜI: tái dùng CHÍNH `UsageLimitService.lock()` (advisory lock transaction-scoped) —
 * không phát minh lock key riêng. Khoá CẢ 5 tài nguyên theo thứ tự canonical cố định
 * `USAGE_RESOURCE_TYPES` (USER→BRANCH→WAREHOUSE→PRODUCT→CUSTOMER) TRƯỚC khi đếm usage, bất kể target
 * plan có giới hạn hữu hạn ở tài nguyên đó hay không — đảm bảo serialize đầy đủ với MỌI writer tăng
 * usage (`prisma-user/branch/warehouse/product/customer.repository.ts`'s `create()`/`restore()`, vốn
 * cũng khoá đúng 5 key này trước khi đếm+ghi) VÀ với 1 lệnh `change-plan` khác đang chạy đồng thời
 * cho CÙNG Organization (cùng thứ tự khoá → không deadlock).
 *
 * ĐẾM USAGE: dùng ĐÚNG ngữ nghĩa "tính là đang dùng" đã khoá ở T053.05B cho từng resource (KHÔNG suy
 * diễn lại) — xác nhận trực tiếp từ `prisma-{user,branch,warehouse,product,customer}.repository.ts`:
 *   USER: deletedAt IS NULL (status ACTIVE/INACTIVE/LOCKED đều tính)
 *   BRANCH: status = ACTIVE (ARCHIVED giải phóng hạn mức)
 *   WAREHOUSE / PRODUCT / CUSTOMER: deletedAt IS NULL
 *
 * GIỚI HẠN TARGET: đọc từ CHÍNH `computeSubscriptionDefaults()` (Single Source of Truth,
 * `subscription-plan-defaults.ts`) — không copy số liệu riêng ở đây.
 *
 * entitlementOverrides KHÔNG BAO GIỜ bị đụng tới bởi CLI này — đây là policy độc lập theo Organization,
 * không thuộc về Plan (T053.03 doc-comment trên field này trong schema.prisma).
 */

export const ALLOWED_TARGET_PLANS = [
  'FREE',
  'BASIC',
  'PRO',
  'ENTERPRISE',
] as const;
export type AllowedTargetPlan = (typeof ALLOWED_TARGET_PLANS)[number];

export class SubscriptionPlanChangeOrganizationNotFoundError extends Error {}
export class SubscriptionPlanChangeSubscriptionMissingError extends Error {}
export class SubscriptionPlanChangeInvalidTargetPlanError extends Error {}
export class SubscriptionPlanChangeInvalidTargetError extends Error {}
export class SubscriptionPlanChangeDowngradeBlockedError extends Error {
  constructor(
    message: string,
    public readonly resource: UsageResourceType,
    public readonly currentUsage: number,
    public readonly targetLimit: number,
  ) {
    super(message);
  }
}

export interface SubscriptionPlanChangeInput {
  organizationId?: string;
  organizationSlug?: string;
  targetPlan: string;
  /** true = "--confirm" đã truyền — thực sự ghi. false = preview/dry-run, KHÔNG ghi gì. */
  commit: boolean;
}

export interface LimitsSnapshot {
  maxBranch: number | null;
  maxUser: number | null;
  maxWarehouse: number | null;
  maxProduct: number | null;
  maxCustomer: number | null;
  storageLimitGB: number | null;
}

export type UsageSnapshot = Record<UsageResourceType, number>;

export type SubscriptionPlanChangeResult =
  | {
      outcome: 'PREVIEW';
      organizationId: string;
      currentPlan: OrganizationPlan;
      currentStatus: string;
      currentLimits: LimitsSnapshot;
      targetPlan: AllowedTargetPlan;
      targetLimits: LimitsSnapshot;
      usage: UsageSnapshot;
      noOp: boolean;
      allowed: boolean;
      blockedResource?: UsageResourceType;
      blockedCurrentUsage?: number;
      blockedTargetLimit?: number;
    }
  | {
      outcome: 'NO_OP';
      organizationId: string;
      currentPlan: OrganizationPlan;
      currentStatus: string;
      currentLimits: LimitsSnapshot;
    }
  | {
      outcome: 'CHANGED';
      organizationId: string;
      previousPlan: OrganizationPlan;
      previousStatus: string;
      previousLimits: LimitsSnapshot;
      targetPlan: AllowedTargetPlan;
      targetLimits: LimitsSnapshot;
      auditLogId: string;
    };

type SubscriptionPlanChangerPrismaClient = Pick<
  PrismaClient,
  | 'organization'
  | 'organizationSubscription'
  | 'user'
  | 'branch'
  | 'warehouse'
  | 'product'
  | 'customer'
  | 'auditLog'
  | '$transaction'
>;

function isAllowedTargetPlan(value: string): value is AllowedTargetPlan {
  return (ALLOWED_TARGET_PLANS as readonly string[]).includes(value);
}

function toLimitsSnapshot(row: {
  maxBranch: number | null;
  maxUser: number | null;
  maxWarehouse: number | null;
  maxProduct: number | null;
  maxCustomer: number | null;
  storageLimitGB: number | null;
}): LimitsSnapshot {
  return {
    maxBranch: row.maxBranch,
    maxUser: row.maxUser,
    maxWarehouse: row.maxWarehouse,
    maxProduct: row.maxProduct,
    maxCustomer: row.maxCustomer,
    storageLimitGB: row.storageLimitGB,
  };
}

function limitsEqual(a: LimitsSnapshot, b: LimitsSnapshot): boolean {
  return (
    a.maxBranch === b.maxBranch &&
    a.maxUser === b.maxUser &&
    a.maxWarehouse === b.maxWarehouse &&
    a.maxProduct === b.maxProduct &&
    a.maxCustomer === b.maxCustomer &&
    a.storageLimitGB === b.storageLimitGB
  );
}

async function countUsage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  resource: UsageResourceType,
): Promise<number> {
  switch (resource) {
    case 'USER':
      return tx.user.count({ where: { organizationId, deletedAt: null } });
    case 'BRANCH':
      return tx.branch.count({ where: { organizationId, status: 'ACTIVE' } });
    case 'WAREHOUSE':
      return tx.warehouse.count({
        where: { organizationId, deletedAt: null },
      });
    case 'PRODUCT':
      return tx.product.count({ where: { organizationId, deletedAt: null } });
    case 'CUSTOMER':
      return tx.customer.count({
        where: { organizationId, deletedAt: null },
      });
  }
}

function pickTargetLimit(
  limits: LimitsSnapshot,
  resource: UsageResourceType,
): number | null {
  switch (resource) {
    case 'USER':
      return limits.maxUser;
    case 'BRANCH':
      return limits.maxBranch;
    case 'WAREHOUSE':
      return limits.maxWarehouse;
    case 'PRODUCT':
      return limits.maxProduct;
    case 'CUSTOMER':
      return limits.maxCustomer;
  }
}

/**
 * Idempotent theo đúng nghĩa Architect yêu cầu (§22): gọi lại nhiều lần với CÙNG target plan khi
 * subscription ĐÃ đúng trạng thái đó trả về NO_OP, KHÔNG ghi thêm, KHÔNG tạo thêm AuditLog trùng lặp.
 *
 * `commit=false` (preview/dry-run) và `commit=true` dùng CHUNG 1 luồng đọc/khoá/đếm/kiểm tra — chỉ
 * khác ở bước ghi cuối cùng — đảm bảo số liệu preview phản ánh ĐÚNG những gì sẽ xảy ra nếu commit
 * ngay sau đó dưới cùng điều kiện DB (được bảo vệ bởi cùng advisory lock).
 */
export async function changeSubscriptionPlan(
  prisma: SubscriptionPlanChangerPrismaClient,
  input: SubscriptionPlanChangeInput,
): Promise<SubscriptionPlanChangeResult> {
  if (
    (input.organizationId && input.organizationSlug) ||
    (!input.organizationId && !input.organizationSlug)
  ) {
    throw new SubscriptionPlanChangeInvalidTargetError(
      'Phải cung cấp CHÍNH XÁC 1 trong 2: --organization-id HOẶC --organization-slug, không được cả hai hoặc không cái nào.',
    );
  }
  if (!isAllowedTargetPlan(input.targetPlan)) {
    throw new SubscriptionPlanChangeInvalidTargetPlanError(
      `Plan mục tiêu "${input.targetPlan}" không hợp lệ. CLI này chỉ hỗ trợ chuyển sang: ${ALLOWED_TARGET_PLANS.join(', ')}. ` +
        `Chuyển VỀ TRIAL không được hỗ trợ (không có chính sách "dùng thử lại" nào được Architect phê duyệt).`,
    );
  }
  const targetPlan = input.targetPlan;

  const organization = await prisma.organization.findUnique({
    where: input.organizationId
      ? { id: input.organizationId }
      : { slug: input.organizationSlug! },
  });
  if (!organization) {
    throw new SubscriptionPlanChangeOrganizationNotFoundError(
      `Không tìm thấy Organization (${input.organizationId ? `id=${input.organizationId}` : `slug=${input.organizationSlug}`}).`,
    );
  }
  const organizationId = organization.id;

  const usageLimit = new UsageLimitService();

  return prisma.$transaction(async (tx) => {
    // Khoá CẢ 5 tài nguyên theo thứ tự canonical cố định — serialize với mọi quota-increasing
    // writer VÀ với 1 lệnh change-plan khác đang chạy đồng thời cho cùng Organization.
    for (const resource of USAGE_RESOURCE_TYPES) {
      await usageLimit.lock(tx, organizationId, resource);
    }

    const subscription = await tx.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!subscription) {
      throw new SubscriptionPlanChangeSubscriptionMissingError(
        `Organization ${organizationId} không có OrganizationSubscription — bất biến hệ thống bị vi phạm, không thể đổi plan.`,
      );
    }

    const currentLimits = toLimitsSnapshot(subscription);
    const defaults = computeSubscriptionDefaults(targetPlan, new Date());
    const targetLimits: LimitsSnapshot = {
      maxBranch: defaults.maxBranch,
      maxUser: defaults.maxUser,
      maxWarehouse: defaults.maxWarehouse,
      maxProduct: defaults.maxProduct,
      maxCustomer: defaults.maxCustomer,
      storageLimitGB: defaults.storageLimitGB,
    };
    // Target không bao giờ là TRIAL (đã chặn ở validate phía trên) → defaults.expiredAt luôn null.
    const targetExpiredAt = defaults.expiredAt;
    const targetStatus = 'ACTIVE';

    const noOp =
      subscription.plan === targetPlan &&
      subscription.status === targetStatus &&
      subscription.expiredAt === null &&
      limitsEqual(currentLimits, targetLimits);

    const usage: UsageSnapshot = {
      USER: 0,
      BRANCH: 0,
      WAREHOUSE: 0,
      PRODUCT: 0,
      CUSTOMER: 0,
    };
    let blockedResource: UsageResourceType | undefined;
    let blockedCurrentUsage: number | undefined;
    let blockedTargetLimit: number | undefined;

    for (const resource of USAGE_RESOURCE_TYPES) {
      const currentUsage = await countUsage(tx, organizationId, resource);
      usage[resource] = currentUsage;
      const targetLimit = pickTargetLimit(targetLimits, resource);
      if (
        !blockedResource &&
        targetLimit !== null &&
        currentUsage > targetLimit
      ) {
        blockedResource = resource;
        blockedCurrentUsage = currentUsage;
        blockedTargetLimit = targetLimit;
      }
    }
    const allowed = blockedResource === undefined;

    if (!input.commit) {
      return {
        outcome: 'PREVIEW',
        organizationId,
        currentPlan: subscription.plan,
        currentStatus: subscription.status,
        currentLimits,
        targetPlan,
        targetLimits,
        usage,
        noOp,
        allowed,
        blockedResource,
        blockedCurrentUsage,
        blockedTargetLimit,
      };
    }

    if (noOp) {
      return {
        outcome: 'NO_OP',
        organizationId,
        currentPlan: subscription.plan,
        currentStatus: subscription.status,
        currentLimits,
      };
    }

    if (!allowed) {
      throw new SubscriptionPlanChangeDowngradeBlockedError(
        `Không thể chuyển sang plan "${targetPlan}": tài nguyên ${blockedResource} đang dùng ${blockedCurrentUsage}, vượt hạn mức mục tiêu ${blockedTargetLimit}. Dữ liệu hiện có KHÔNG bị xoá/khoá — chỉ chặn thao tác đổi plan này để tránh tạo trạng thái thương mại vượt hạn mức ngay khi chuyển.`,
        blockedResource!,
        blockedCurrentUsage!,
        blockedTargetLimit!,
      );
    }

    const updated = await tx.organizationSubscription.update({
      where: { organizationId },
      data: {
        plan: targetPlan,
        status: targetStatus,
        expiredAt: targetExpiredAt,
        maxBranch: targetLimits.maxBranch,
        maxUser: targetLimits.maxUser,
        maxWarehouse: targetLimits.maxWarehouse,
        maxProduct: targetLimits.maxProduct,
        maxCustomer: targetLimits.maxCustomer,
        storageLimitGB: targetLimits.storageLimitGB,
      },
    });

    const auditLog = await tx.auditLog.create({
      data: {
        organizationId,
        userId: null,
        action: 'organization.subscription.plan_changed',
        entityType: 'OrganizationSubscription',
        entityId: updated.id,
        oldValue: {
          plan: subscription.plan,
          status: subscription.status,
          expiredAt: subscription.expiredAt?.toISOString() ?? null,
          limits: { ...currentLimits },
        },
        newValue: {
          plan: targetPlan,
          status: targetStatus,
          expiredAt: targetExpiredAt?.toISOString() ?? null,
          limits: { ...targetLimits },
          changedVia: 'cli',
        },
      },
    });

    return {
      outcome: 'CHANGED',
      organizationId,
      previousPlan: subscription.plan,
      previousStatus: subscription.status,
      previousLimits: currentLimits,
      targetPlan,
      targetLimits,
      auditLogId: auditLog.id,
    };
  });
}
