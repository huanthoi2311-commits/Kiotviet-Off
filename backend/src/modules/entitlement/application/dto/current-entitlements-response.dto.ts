import { ApiProperty } from '@nestjs/swagger';

/**
 * T053.03 Architect Decision (Current Entitlement Context Defect) — hợp đồng đọc HẸP cho
 * "CURRENT TENANT EFFECTIVE ENTITLEMENTS". Đây chỉ là tiện ích UI (đọc lại chính authorization
 * context của actor đang gọi), KHÔNG cấp quyền — mọi route nghiệp vụ thật vẫn tự bảo vệ độc lập
 * qua EntitlementGuard/PermissionsGuard. Vì vậy KHÔNG yêu cầu bất kỳ permission nào (không phải
 * `organization:view`, không phải permission thương mại nào khác) — xem `entitlement.controller.ts`.
 */
export class CurrentEntitlementsResponseDto {
  @ApiProperty({ type: [String] })
  effectiveFeatures: string[];
}
