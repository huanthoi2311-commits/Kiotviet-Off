import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { JwtAccessPayload } from '../../../../common/types/jwt-payload.type';
import { PERMISSIONS_KEY } from '../../../rbac/presentation/permissions.decorator';

/**
 * T030.12N/T030.12O — GET /:id và GET /current phải cho qua CẢ Platform Admin (đứng ngoài
 * RBAC per-tenant, ADR-0003 — JWT của họ luôn có `permissions: []`, đúng thiết kế) LẪN
 * tenant user có quyền `organization:view`. PermissionsGuard dùng chung toàn hệ thống
 * không biết `isPlatformAdmin` — không sửa PermissionsGuard (ảnh hưởng mọi module khác),
 * dùng guard riêng trong phạm vi Organization, giữ nguyên @RequirePermissions() đã khai.
 * OrganizationService.assertOrganizationContext() đã cho Platform Admin bỏ qua org-scoping
 * từ trước (có unit test), guard này chỉ mở đường tới đó.
 */
@Injectable()
export class PlatformAdminOrPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtAccessPayload }>();

    if (request.user?.isPlatformAdmin) return true;

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const userPermissions = request.user?.permissions ?? [];
    const hasPermission = required.some((permission) =>
      userPermissions.includes(permission),
    );
    if (!hasPermission) {
      throw new ForbiddenException(
        withCode(
          ErrorCode.RBAC_MISSING_PERMISSION,
          `Thiếu quyền: ${required.join(' hoặc ')}`,
        ),
      );
    }

    return true;
  }
}
