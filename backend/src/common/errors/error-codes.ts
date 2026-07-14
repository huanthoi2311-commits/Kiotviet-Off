/**
 * Danh mục mã lỗi toàn hệ thống — mọi exception nghiệp vụ phải đi kèm 1 code ở đây
 * thay vì chỉ có message tự do, để Frontend switch/case theo `code` thay vì so message.
 */
export const ErrorCode = {
  // Auth (AUTH_xxx)
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_ACCOUNT_NOT_ACTIVE: 'AUTH_002',
  AUTH_REFRESH_TOKEN_INVALID: 'AUTH_003',
  AUTH_REFRESH_TOKEN_REUSED: 'AUTH_004',
  AUTH_REFRESH_TOKEN_EXPIRED: 'AUTH_005',
  AUTH_PERMISSION_VERSION_MISMATCH: 'AUTH_006',
  AUTH_TENANT_NOT_FOUND: 'AUTH_007',

  // RBAC (RBAC_xxx)
  RBAC_ROLE_NOT_FOUND: 'RBAC_001',
  RBAC_ROLE_CODE_CONFLICT: 'RBAC_002',
  RBAC_PERMISSION_CODE_INVALID: 'RBAC_003',
  RBAC_MISSING_PERMISSION: 'RBAC_004',

  // OTP / Forgot Password (OTP_xxx)
  OTP_RATE_LIMIT_EXCEEDED: 'OTP_001',
  OTP_INVALID_OR_EXPIRED: 'OTP_002',
  OTP_INCORRECT: 'OTP_003',
  OTP_MAX_ATTEMPTS_EXCEEDED: 'OTP_004',
  OTP_NOT_VERIFIED: 'OTP_005',
  OTP_COOLDOWN_ACTIVE: 'OTP_006',
  OTP_ACCOUNT_NOT_FOUND: 'OTP_007',

  // Generic (dùng khi exception không tự gắn code cụ thể)
  VALIDATION_FAILED: 'VALIDATION_001',
  NOT_FOUND: 'HTTP_404',
  FORBIDDEN: 'HTTP_403',
  UNAUTHORIZED: 'HTTP_401',
  CONFLICT: 'HTTP_409',
  TOO_MANY_REQUESTS: 'HTTP_429',
  INTERNAL_SERVER_ERROR: 'HTTP_500',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
