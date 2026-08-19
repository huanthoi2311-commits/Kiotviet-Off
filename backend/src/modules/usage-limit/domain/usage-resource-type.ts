/** T053.05B — 5 loại tài nguyên bị giới hạn theo gói (Architect Decision, T053.05 Discovery §4).
 * storageLimitGB KHÔNG có trong danh sách này — chỉ là metadata thương mại ở V1, KHÔNG enforce. */
export const USAGE_RESOURCE_TYPES = [
  'USER',
  'BRANCH',
  'WAREHOUSE',
  'PRODUCT',
  'CUSTOMER',
] as const;

export type UsageResourceType = (typeof USAGE_RESOURCE_TYPES)[number];
