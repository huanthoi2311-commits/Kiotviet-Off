import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { EntitlementService } from '../application/entitlement.service';
import { CommercialFeature } from '../domain/policies/commercial-features';
import { ENTITLEMENT_KEY } from './entitlement.decorator';

/**
 * T053.03 §9/§11 — Kiểm tra entitlement TRƯỚC PermissionsGuard (thứ tự guard trong @UseGuards()).
 *
 * Architect Decision (T053.03 Platform Admin Entitlement Bypass, sau T053.02A) — KHÔNG bypass
 * entitlement chỉ vì `isPlatformAdmin === true`. Platform Admin và tenant subscription entitlement
 * là 2 chiều authorization TÁCH BIỆT: `isPlatformAdmin` cho phép thao tác cấp NỀN TẢNG ở route đã tự
 * khai báo yêu cầu đó (`PlatformAdminGuard`/`PlatformAdminOrPermissionsGuard`, vd `POST
 * /organizations`) — KHÔNG có nghĩa "mọi Organization tự động có mọi tính năng thương mại khi người
 * gọi là Platform Admin". Route nghiệp vụ tenant thường (`POST /users`/`/roles`/`/suppliers`) vẫn
 * chịu đúng entitlement của Organization đang thao tác, kể cả khi actor là Platform Admin — không có
 * ngoại lệ URL/path-name nào ở đây (route platform-admin thật KHÔNG gắn `@RequireEntitlement()`, nên
 * guard này không bao giờ chạy tới nhánh entitlement cho những route đó — tách biệt tự nhiên qua
 * metadata/guard composition, không qua so khớp chuỗi URL).
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementService: EntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CommercialFeature>(
      ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: JwtAccessPayload }>();
    const user = request.user;
    if (!user) return true;

    const allowed = await this.entitlementService.hasFeature(
      user.organizationId,
      required,
    );
    if (!allowed) {
      throw new ForbiddenException(
        withCode(
          ErrorCode.ENTITLEMENT_FEATURE_NOT_INCLUDED,
          'Tính năng này không có trong gói hiện tại.',
        ),
      );
    }
    return true;
  }
}
