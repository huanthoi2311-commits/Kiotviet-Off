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
import { InvoiceQueryDto } from '../application/dto/invoice-query.dto';
import {
  InvoiceResponseDto,
  PaginatedInvoiceResponseDto,
} from '../application/dto/invoice-response.dto';
import { InvoiceService } from '../application/invoice.service';

/**
 * Chỉ có route xem (Prompt 035) — Invoice luôn được tạo bởi Checkout Engine trong 1
 * transaction, không có route "tạo hóa đơn" độc lập ở module này.
 */
@ApiTags('Invoice')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('invoice:view')
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách hóa đơn, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedInvoiceResponseDto })
  search(
    @Query() query: InvoiceQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedInvoiceResponseDto> {
    return this.invoiceService.search(query, user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết 1 hóa đơn kèm dòng hàng' })
  @ApiResponse({ status: 200, type: InvoiceResponseDto })
  getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<InvoiceResponseDto> {
    return this.invoiceService.getById(id, user.organizationId);
  }
}
