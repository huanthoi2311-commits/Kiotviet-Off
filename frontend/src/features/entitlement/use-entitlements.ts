'use client';

import { useEntitlementControllerGetCurrent } from '@/generated/entitlement/entitlement';
import { useAuthStore } from '@/stores/auth-store';
import type { CommercialFeature } from './commercial-feature';

/**
 * T053.03 Architect Decision (Current Entitlement Context Defect) — đọc từ `GET
 * /entitlements/current`, KHÔNG còn `GET /organizations/current` (route đó yêu cầu
 * `organization:view` — coupling sai: một user có `user:view` nhưng KHÔNG có `organization:view`
 * sẽ bị fail-closed về "không có feature nào" dù Organization của họ THẬT SỰ có feature đó, làm
 * Entitlement phụ thuộc ngầm vào 1 permission không liên quan). `GET /entitlements/current` không
 * yêu cầu permission nào — chỉ cần đăng nhập — nên hook này hoạt động cho MỌI user đã xác thực,
 * không còn gate theo `organization:view` nữa.
 *
 * Vẫn chỉ là TIỆN ÍCH UI, KHÔNG BAO GIỜ là nguồn xác thực (backend luôn tự kiểm tra lại qua
 * EntitlementGuard). react-query staleTime mặc định 30s toàn cục — đủ "short cache", không thêm cơ
 * chế cache riêng.
 */
export function useEntitlements(): {
  effectiveFeatures: CommercialFeature[];
  hasFeature: (feature: CommercialFeature) => boolean;
  isLoading: boolean;
} {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { data, isLoading } = useEntitlementControllerGetCurrent({
    query: { enabled: isAuthenticated },
  });

  const effectiveFeatures = (data?.effectiveFeatures ?? []) as CommercialFeature[];

  return {
    effectiveFeatures,
    hasFeature: (feature: CommercialFeature) => effectiveFeatures.includes(feature),
    isLoading: isAuthenticated ? isLoading : false,
  };
}
