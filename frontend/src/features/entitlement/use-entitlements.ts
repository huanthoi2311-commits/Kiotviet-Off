'use client';

import { useOrganizationControllerGetCurrent } from '@/generated/organization/organization';
import { usePermission } from '@/hooks/use-permission';
import type { CommercialFeature } from './commercial-feature';

/**
 * T053.03 §13 — Tiện ích UI, KHÔNG BAO GIỜ là nguồn xác thực (backend luôn tự kiểm tra lại qua
 * EntitlementGuard). Đọc từ `GET /organizations/current` (đã có react-query staleTime mặc định
 * 30s toàn cục — đủ "short cache" theo §22, không thêm cơ chế cache riêng).
 *
 * Route `GET /organizations/current` yêu cầu permission `organization:view` (không đổi bởi
 * T053.03 — ngoài phạm vi package này). User KHÔNG có permission đó sẽ không gọi API này
 * (`enabled: canViewOrganization`) — tránh gọi API chắc chắn 403 kèm toast lỗi toàn cục không cần
 * thiết cho mọi trang; fail-closed về "không có feature nào" (an toàn hơn là fail-open).
 */
export function useEntitlements(): {
  effectiveFeatures: CommercialFeature[];
  hasFeature: (feature: CommercialFeature) => boolean;
  isLoading: boolean;
} {
  const canViewOrganization = usePermission('organization:view');
  const { data, isLoading } = useOrganizationControllerGetCurrent({
    query: { enabled: canViewOrganization },
  });

  const effectiveFeatures = (data?.subscription.effectiveFeatures ?? []) as CommercialFeature[];

  return {
    effectiveFeatures,
    hasFeature: (feature: CommercialFeature) => effectiveFeatures.includes(feature),
    isLoading: canViewOrganization ? isLoading : false,
  };
}
