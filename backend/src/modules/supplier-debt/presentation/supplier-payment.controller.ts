import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  SupplierDebtService,
} from '../application/supplier-debt.service';
import { CreateSupplierPaymentDto } from '../application/dto/create-supplier-payment.dto';
import { SupplierPaymentResponseDto } from '../application/dto/supplier-payment-response.dto';

/** Permission tái dùng nguyên trạng từ catalog Foundation (Prompt 015) — không thêm permission mới. */
@ApiTags('SupplierPayment')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supplier-payment')
export class SupplierPaymentController {
  constructor(private readonly supplierDebtService: SupplierDebtService) {}

  @Post()
  @RequirePermissions('payment:create')
  @ApiOperation({
    summary:
      'Ghi nhận thanh toán cho nhà cung cấp — giảm công nợ (chặn nếu vượt quá công nợ hiện tại)',
  })
  @ApiResponse({ status: 201, type: SupplierPaymentResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierPaymentResponseDto> {
    return this.supplierDebtService.createPayment(dto, this.toActor(user, req));
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
