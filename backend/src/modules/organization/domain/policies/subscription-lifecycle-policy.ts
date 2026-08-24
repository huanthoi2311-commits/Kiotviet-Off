import {
  OrganizationPlan,
  OrganizationSubscriptionStatus,
} from '../entities/organization.entity';

/**
 * T053.06F — snapshot tối thiểu cần thiết để xác định "hiệu lực" (effective) của một
 * OrganizationSubscription, dùng chung bởi EntitlementService/UsageLimitService (Architect
 * Implementation Authorization §15: "Avoid duplicating expiry predicates between Entitlement and
 * UsageLimit"). Import file THUẦN (function/type), KHÔNG import @Module nào — không tạo phụ
 * thuộc NestJS DI giữa các module (mirror precedent hiện có: `plan-entitlements.ts` đã import
 * type `OrganizationPlan` từ đây theo đúng cách này).
 */
export interface SubscriptionLifecycleSnapshot {
  plan: OrganizationPlan;
  status: OrganizationSubscriptionStatus;
  expiredAt: Date | null;
}

/**
 * T053.06F Architect Decision §1/§2/§4 — dự đoán "hiệu lực hết hạn" (effective expiry), KHÔNG chỉ
 * dựa vào `status` đã persist (đó là việc CỦA scheduler, xem `expireDueTrials()`). Đây là fail-safe
 * thời gian request — coi 1 subscription là hết hạn khi:
 *
 *   - đã persist `status = EXPIRED` (scheduler đã chạy), HOẶC
 *   - vẫn còn `status = ACTIVE` nhưng `plan = TRIAL` và `expiredAt <= now` (scheduler CHƯA chạy —
 *     đây chính là fail-safe: "correctness MUST NOT depend on the scheduler having run", §4).
 *
 * CHỈ áp dụng cho `plan = TRIAL` (§1/§18 — không đụng FREE/BASIC/PRO/ENTERPRISE dù `expiredAt` vô
 * tình khác null). `status = CANCELLED` KHÔNG được coi là "expired" bởi hàm này — đây là trạng
 * thái riêng, không thuộc phạm vi T053.06F (§19: "CANCELLED rows remain CANCELLED", không có
 * writer nào tạo ra trạng thái này trong codebase hiện tại — không tự suy diễn thêm ngữ nghĩa).
 *
 * Biên bao gồm (`<=`, INCLUSIVE — §2): `expiredAt <= now` nghĩa là ĐÃ hết hạn. So sánh qua
 * epoch-millisecond của `Date` — an toàn với timezone/UTC theo cấu trúc (§26.L), không dùng lịch
 * theo ngày địa phương.
 */
export function isSubscriptionExpired(
  snapshot: SubscriptionLifecycleSnapshot,
  now: Date = new Date(),
): boolean {
  if (snapshot.plan !== 'TRIAL') return false;
  if (snapshot.status === 'EXPIRED') return true;
  if (snapshot.status !== 'ACTIVE') return false;
  if (!snapshot.expiredAt) return false;
  return snapshot.expiredAt.getTime() <= now.getTime();
}
