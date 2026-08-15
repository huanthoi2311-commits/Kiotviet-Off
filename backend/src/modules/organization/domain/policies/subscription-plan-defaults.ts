import { OrganizationPlan } from '../entities/organization.entity';

/**
 * T053.02 — Single Source of Truth cho giới hạn tài nguyên mặc định theo từng Plan. Không module
 * nào khác được tự định nghĩa số giới hạn riêng — mọi nơi cần "giới hạn mặc định của Plan X"
 * PHẢI đọc từ đây (Architect Decision D3, T053.02 §"Subscription defaults must be centralized").
 *
 * CHỈ là cấu hình dữ liệu — KHÔNG có logic enforcement ở đây hay bất kỳ đâu khác trong T053.02.
 * Không ai đọc các giới hạn này để chặn thao tác cho tới T053.05.
 */
export interface SubscriptionPlanLimits {
  maxBranch: number | null;
  maxUser: number | null;
  maxWarehouse: number | null;
  maxProduct: number | null;
  maxCustomer: number | null;
  storageLimitGB: number | null;
}

/**
 * FREE: giữ NGUYÊN hành vi hiện có (mọi giới hạn NULL = không giới hạn) — đây là hành vi mặc định
 * THẬT SỰ đã tồn tại từ Sprint-00 (schema.prisma không có `@default` nào cho các cột `max*`), xác
 * nhận qua chính test hiện có (`prisma-organization.repository.spec.ts`: `rawSubscription` toàn
 * `null`) — KHÔNG phải giá trị tự bịa ra cho package này (T053.02 D3: "Do NOT invent limits" cho
 * FREE).
 *
 * TRIAL/BASIC/PRO: giá trị do Architect quyết định trực tiếp (T053.02 D3), không suy diễn.
 * ENTERPRISE: không giới hạn theo mặc định (D3), tương đương FREE về mặt kỹ thuật nhưng tách biệt
 * theo Plan để mỗi dòng ở đây độc lập, dễ đổi sau này mà không ảnh hưởng Plan khác.
 */
export const SUBSCRIPTION_PLAN_LIMITS: Record<
  OrganizationPlan,
  SubscriptionPlanLimits
> = {
  FREE: {
    maxBranch: null,
    maxUser: null,
    maxWarehouse: null,
    maxProduct: null,
    maxCustomer: null,
    storageLimitGB: null,
  },
  TRIAL: {
    maxBranch: 1,
    maxUser: 3,
    maxWarehouse: 1,
    maxProduct: 50,
    maxCustomer: 50,
    storageLimitGB: 1,
  },
  BASIC: {
    maxBranch: 2,
    maxUser: 5,
    maxWarehouse: 2,
    maxProduct: 500,
    maxCustomer: null,
    storageLimitGB: 5,
  },
  PRO: {
    maxBranch: 10,
    maxUser: 20,
    maxWarehouse: 10,
    maxProduct: null,
    maxCustomer: null,
    storageLimitGB: 25,
  },
  ENTERPRISE: {
    maxBranch: null,
    maxUser: null,
    maxWarehouse: null,
    maxProduct: null,
    maxCustomer: null,
    storageLimitGB: null,
  },
};

/**
 * T053.01 §25 Q3 — độ dài dùng thử KHÔNG được Architect chỉ định số cụ thể trong D3 (chỉ giới
 * hạn tài nguyên). 14 ngày là giá trị mặc định phổ biến, đặt tên rõ ràng ở đây để dễ điều chỉnh —
 * KHÔNG rải rác số "14" ở nơi khác.
 */
export const TRIAL_DURATION_DAYS = 14;

export interface SubscriptionDefaults extends SubscriptionPlanLimits {
  expiredAt: Date | null;
}

/**
 * Chỉ TRIAL có `expiredAt` được tính tự động (bằng field `expiredAt` ĐÃ CÓ SẴN trên
 * OrganizationSubscription — không cần cột `trialEndsAt` mới, T053.01 §21 tự nhận định điều
 * này). Mọi Plan khác giữ `expiredAt: null` (không hết hạn theo mặc định) — khớp hành vi hiện có.
 */
export function computeSubscriptionDefaults(
  plan: OrganizationPlan,
  now: Date = new Date(),
): SubscriptionDefaults {
  return {
    ...SUBSCRIPTION_PLAN_LIMITS[plan],
    expiredAt:
      plan === 'TRIAL'
        ? new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)
        : null,
  };
}
