import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { PurchaseReportService } from '../application/purchase-report.service';
import {
  PurchaseReportBreakdownQueryDto,
  PurchaseReportExportQueryDto,
  PurchaseReportFilterDto,
} from '../application/dto/purchase-report-query.dto';
import {
  PaginatedPurchaseReportBreakdownResponseDto,
  PurchaseReportDashboardResponseDto,
} from '../application/dto/purchase-report-response.dto';

/** Permission tái dùng nguyên trạng `report:view`/`report:export` từ catalog Foundation (Prompt 015) — không thêm permission mới. */
@ApiTags('PurchaseReport')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-reports')
export class PurchaseReportController {
  constructor(private readonly purchaseReportService: PurchaseReportService) {}

  @Get('dashboard')
  @RequirePermissions('report:view')
  @ApiOperation({
    summary:
      'Dashboard nhập hàng: Total Purchase, Top Supplier, Top Product, Average Cost, Monthly Purchase',
  })
  @ApiResponse({ status: 200, type: PurchaseReportDashboardResponseDto })
  getDashboard(
    @Query() query: PurchaseReportFilterDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PurchaseReportDashboardResponseDto> {
    return this.purchaseReportService.getDashboard(query, user.organizationId);
  }

  @Get('breakdown')
  @RequirePermissions('report:view')
  @ApiOperation({
    summary:
      'Phân tích nhập hàng theo 1 trong 6 chiều: Supplier/Product/Warehouse/Month/User/Category',
  })
  @ApiResponse({
    status: 200,
    type: PaginatedPurchaseReportBreakdownResponseDto,
  })
  getBreakdown(
    @Query() query: PurchaseReportBreakdownQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedPurchaseReportBreakdownResponseDto> {
    return this.purchaseReportService.getBreakdown(query, user.organizationId);
  }

  @Get('export')
  @RequirePermissions('report:export')
  @ApiOperation({ summary: 'Xuất báo cáo nhập hàng — Excel/CSV/PDF' })
  @Header('Content-Disposition', 'attachment')
  async export(
    @Query() query: PurchaseReportExportQueryDto,
    @CurrentUser() user: JwtAccessPayload,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.purchaseReportService.exportReport(
      query,
      user.organizationId,
    );
    const filename = `purchase-report-${query.groupBy.toLowerCase()}.${result.fileExtension}`;
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result.buffer);
  }
}
