import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { EntitlementService } from '../application/entitlement.service';
import { CurrentEntitlementsResponseDto } from '../application/dto/current-entitlements-response.dto';

/**
 * T053.03 Architect Decision (Current Entitlement Context Defect) — `GET /entitlements/current`
 * đọc lại CHÍNH authorization context của actor đang gọi (giống việc actor tự "hỏi" server "quyền
 * thương mại hiệu lực của tổ chức tôi là gì"), KHÔNG cấp quyền — mọi route nghiệp vụ thật vẫn tự
 * bảo vệ độc lập qua `EntitlementGuard`/`PermissionsGuard` như trước, không đổi.
 *
 * KHÔNG yêu cầu permission nào (không `organization:view`, không permission thương mại nào khác)
 * — chỉ cần đăng nhập (`JwtAuthGuard`). `organizationId` LUÔN lấy từ JWT đã xác thực
 * (`actor.organizationId`), KHÔNG BAO GIỜ nhận từ client — không có tham số nào trên route này.
 */
@ApiTags('Entitlement')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard)
@Controller('entitlements')
export class EntitlementController {
  constructor(private readonly entitlementService: EntitlementService) {}

  @Get('current')
  @ApiOperation({
    summary:
      'Danh sách CommercialFeature hiệu lực của tổ chức hiện tại (tiện ích UI, không cấp quyền)',
  })
  @ApiResponse({ status: 200, type: CurrentEntitlementsResponseDto })
  async getCurrent(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CurrentEntitlementsResponseDto> {
    const effectiveFeatures =
      await this.entitlementService.getEffectiveFeatures(user.organizationId);
    return { effectiveFeatures };
  }
}
