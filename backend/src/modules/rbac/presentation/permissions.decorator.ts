import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Yêu cầu access token phải chứa ít nhất một trong các permission code truyền vào.
 * Dùng cùng JwtAuthGuard + PermissionsGuard: `@UseGuards(JwtAuthGuard, PermissionsGuard)`.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
