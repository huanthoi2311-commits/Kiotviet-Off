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
 * Platform Admin bypass: route đại diện (POST /users, /roles, /suppliers) là route nghiệp vụ bình
 * thường, không phải route platform-admin riêng — nhưng Organization "bootstrap" của chính Platform
 * Admin luôn mặc định FREE plan (T053.02), tức là KHÔNG có USER_MANAGEMENT/RBAC_MANAGEMENT theo ma
 * trận §2. Nếu không bypass, Platform Admin sẽ tự khóa chính mình khỏi việc quản lý user/role của
 * Organization bootstrap — phá vỡ luồng bootstrap/E2E hiện có. Bypass đặt DUY NHẤT tại đây (1 điểm
 * tập trung, không rải rác vào từng service) — cùng tiền lệ `assertOrganizationContext` đã dùng
 * `isPlatformAdmin` để bỏ qua ràng buộc tenant thông thường (không phải bypass "ma thuật" mới).
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
    if (user.isPlatformAdmin) return true;

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
