import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { withCode } from '../../../../common/errors/with-code';
import { JwtAccessPayload } from '../../../../common/types/jwt-payload.type';

/**
 * "Chỉ System Admin mới được tạo Organization" (SPEC-ORG-001 §15, Decision 4) — không thêm
 * Global Role, chỉ kiểm tra cờ `isPlatformAdmin` đã nhúng sẵn trong JWT lúc đăng nhập.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtAccessPayload }>();
    if (!request.user?.isPlatformAdmin) {
      throw new ForbiddenException(
        withCode(
          ErrorCode.RBAC_MISSING_PERMISSION,
          'Chỉ Platform Admin mới được thực hiện thao tác này',
        ),
      );
    }
    return true;
  }
}
