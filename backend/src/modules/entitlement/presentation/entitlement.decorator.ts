import { SetMetadata } from '@nestjs/common';
import { CommercialFeature } from '../domain/policies/commercial-features';

export const ENTITLEMENT_KEY = 'entitlement_feature';

/**
 * Yêu cầu Organization của actor phải có CommercialFeature này trong entitlement hiệu lực. Dùng
 * cùng JwtAuthGuard + EntitlementGuard: `@UseGuards(JwtAuthGuard, EntitlementGuard, PermissionsGuard)`
 * — entitlement luôn kiểm tra TRƯỚC RBAC (T053.03 §9).
 */
export const RequireEntitlement = (feature: CommercialFeature) =>
  SetMetadata(ENTITLEMENT_KEY, feature);
