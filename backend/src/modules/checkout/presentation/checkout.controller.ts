import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { ActorContext, CheckoutService } from '../application/checkout.service';
import { CheckoutDto } from '../application/dto/checkout.dto';
import { CheckoutResponseDto } from '../application/dto/checkout-response.dto';

@ApiTags('Checkout')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('pos:access')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @ApiOperation({
    summary:
      'Chốt đơn từ giỏ hàng: kiểm tra tồn kho, áp discount/điểm/voucher, thu tiền, sinh hóa đơn — 1 transaction',
  })
  @ApiResponse({ status: 201, type: CheckoutResponseDto })
  @ApiWriteErrors()
  checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CheckoutResponseDto> {
    return this.checkoutService.checkout(dto, this.toActor(user, req));
  }

  private toActor(user: JwtAccessPayload, req: Request): ActorContext {
    return {
      userId: user.sub,
      organizationId: user.organizationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }
}
