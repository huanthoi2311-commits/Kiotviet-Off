import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { SupplierDebtService } from '../application/supplier-debt.service';
import { SupplierDebtQueryDto } from '../application/dto/supplier-debt-query.dto';
import { PaginatedSupplierDebtResponseDto } from '../application/dto/supplier-debt-response.dto';

/** Permission tái dùng nguyên trạng từ catalog Foundation (Prompt 015) — không thêm permission mới. */
@ApiTags('SupplierDebt')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supplier-debt')
export class SupplierDebtController {
  constructor(private readonly supplierDebtService: SupplierDebtService) {}

  @Get()
  @RequirePermissions('debt:view')
  @ApiOperation({
    summary:
      'Công nợ hiện tại theo từng nhà cung cấp — balance = tổng phát sinh (Purchase - Purchase Return) - tổng đã thanh toán',
  })
  @ApiResponse({ status: 200, type: PaginatedSupplierDebtResponseDto })
  search(
    @Query() query: SupplierDebtQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedSupplierDebtResponseDto> {
    return this.supplierDebtService.search(query, user.organizationId);
  }
}
