import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  CustomerPointService,
} from '../application/customer-point.service';
import { AddPointDto } from '../application/dto/add-point.dto';
import { CustomerPointHistoryQueryDto } from '../application/dto/customer-point-history-query.dto';
import {
  CustomerPointLedgerResponseDto,
  PaginatedCustomerPointLedgerResponseDto,
} from '../application/dto/customer-point-response.dto';
import { UsePointDto } from '../application/dto/use-point.dto';

/** Route giữ dạng số ít `customer-point` đúng theo Prompt 032 — tên miền nghiệp vụ (Loyalty), không phải resource-collection REST chuẩn, cùng cách xử lý đã áp dụng ở Supplier Debt (Prompt 029). */
@ApiTags('CustomerPoint')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customer-point')
export class CustomerPointController {
  constructor(private readonly customerPointService: CustomerPointService) {}

  @Post('add')
  @RequirePermissions('point:add')
  @ApiOperation({
    summary: 'Cộng điểm tích lũy cho khách hàng — sinh 1 dòng Ledger mới',
  })
  @ApiResponse({ status: 201, type: CustomerPointLedgerResponseDto })
  @ApiWriteErrors()
  add(
    @Body() dto: AddPointDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerPointLedgerResponseDto> {
    return this.customerPointService.addPoint(dto, this.toActor(user, req));
  }

  @Post('use')
  @RequirePermissions('point:use')
  @ApiOperation({
    summary: 'Sử dụng (trừ) điểm tích lũy — chặn nếu vượt quá số dư hiện tại',
  })
  @ApiResponse({ status: 201, type: CustomerPointLedgerResponseDto })
  @ApiWriteErrors()
  use(
    @Body() dto: UsePointDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerPointLedgerResponseDto> {
    return this.customerPointService.usePoint(dto, this.toActor(user, req));
  }

  @Get('history')
  @RequirePermissions('point:view')
  @ApiOperation({
    summary: 'Lịch sử điểm tích lũy của 1 khách hàng, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedCustomerPointLedgerResponseDto })
  history(
    @Query() query: CustomerPointHistoryQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedCustomerPointLedgerResponseDto> {
    return this.customerPointService.getHistory(query, user.organizationId);
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
