import type { PrismaClient } from '@prisma/client';

/**
 * T053.06F Architect Implementation Authorization §12 — CHỈ ĐỌC (cùng pattern `db-inspector.ts`,
 * `Pick<PrismaClient, '$queryRaw'>` enforce ở compile-time không thể ghi). Dùng cho operator xem
 * TRƯỚC KHI bật enforcement trên production: những TRIAL nào sẽ bị chuyển EXPIRED ngay lập tức
 * (persisted transition + request-time fail-safe) một khi package này triển khai — KHÔNG có API
 * public nào lộ báo cáo này (§12: "Do not expose this through a public tenant API").
 *
 * KHÔNG tự động gia hạn/sửa dữ liệu gì — thuần túy quan sát, để operator tự quyết định (không có
 * chính sách grace-period tự động nào được authorize — §12).
 */
type InspectablePrisma = Pick<PrismaClient, '$queryRaw'>;

export interface TrialSubscriptionCounts {
  totalTrialRows: number;
  activeTrialRows: number;
  overdueActiveTrialRows: number;
  alreadyExpiredRows: number;
}

export async function getTrialExpiryImpactSummary(
  prisma: InspectablePrisma,
  now: Date = new Date(),
): Promise<TrialSubscriptionCounts> {
  const rows = await prisma.$queryRaw<
    Array<{
      total_trial_rows: bigint;
      active_trial_rows: bigint;
      overdue_active_trial_rows: bigint;
      already_expired_rows: bigint;
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE plan = 'TRIAL') AS total_trial_rows,
      COUNT(*) FILTER (WHERE plan = 'TRIAL' AND status = 'ACTIVE') AS active_trial_rows,
      COUNT(*) FILTER (
        WHERE plan = 'TRIAL' AND status = 'ACTIVE' AND "expiredAt" <= ${now}
      ) AS overdue_active_trial_rows,
      COUNT(*) FILTER (WHERE plan = 'TRIAL' AND status = 'EXPIRED') AS already_expired_rows
    FROM organization_subscriptions
  `;
  const row = rows[0];
  return {
    totalTrialRows: Number(row.total_trial_rows),
    activeTrialRows: Number(row.active_trial_rows),
    overdueActiveTrialRows: Number(row.overdue_active_trial_rows),
    alreadyExpiredRows: Number(row.already_expired_rows),
  };
}

export interface OverdueTrialRow {
  organizationId: string;
  organizationCode: string;
  organizationSlug: string;
  expiredAt: Date;
}

/** Danh sách chi tiết (không chỉ đếm) — cho operator xem CHÍNH XÁC tổ chức nào sẽ bị ảnh hưởng,
 * để đối chiếu thủ công/liên hệ khách hàng trước khi enforcement kích hoạt trên production. */
export async function findOverdueActiveTrials(
  prisma: InspectablePrisma,
  now: Date = new Date(),
): Promise<OverdueTrialRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      organization_id: string;
      organization_code: string;
      organization_slug: string;
      expired_at: Date;
    }>
  >`
    SELECT
      o.id AS organization_id,
      o.code AS organization_code,
      o.slug AS organization_slug,
      s."expiredAt" AS expired_at
    FROM organization_subscriptions s
    JOIN organizations o ON o.id = s."organizationId"
    WHERE s.plan = 'TRIAL' AND s.status = 'ACTIVE' AND s."expiredAt" <= ${now}
    ORDER BY s."expiredAt" ASC
  `;
  return rows.map((row) => ({
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    organizationSlug: row.organization_slug,
    expiredAt: row.expired_at,
  }));
}
