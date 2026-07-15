import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { PaymentService } from '../application/payment.service';
import { PaymentResponseDto } from '../application/dto/payment-response.dto';

/**
 * Chỉ có route xem (Prompt 035) — Payment luôn được tạo bởi Checkout Engine trong 1
 * transaction, không có route "tạo thanh toán" độc lập ở module này.
 */
@ApiTags('Payment')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('payment:view')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết 1 thanh toán' })
  @ApiResponse({ status: 200, type: PaymentResponseDto })
  getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaymentResponseDto> {
    return this.paymentService.getById(id, user.organizationId);
  }

  @Get()
  @ApiOperation({ summary: 'Xem danh sách thanh toán của 1 hóa đơn' })
  @ApiResponse({ status: 200, type: [PaymentResponseDto] })
  getByInvoiceId(
    @Query('invoiceId') invoiceId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentService.getByInvoiceId(invoiceId, user.organizationId);
  }
}
