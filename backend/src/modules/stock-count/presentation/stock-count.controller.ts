import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  StockCountService,
} from '../application/stock-count.service';
import { CompleteStockCountDto } from '../application/dto/complete-stock-count.dto';
import { CreateStockCountDto } from '../application/dto/create-stock-count.dto';
import { StockCountQueryDto } from '../application/dto/stock-count-query.dto';
import {
  PaginatedStockCountResponseDto,
  StockCountResponseDto,
} from '../application/dto/stock-count-response.dto';

@ApiTags('StockCount')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('stock-count')
export class StockCountController {
  constructor(private readonly stockCountService: StockCountService) {}

  @Post()
  @RequirePermissions('stock_count:create')
  @ApiOperation({
    summary: 'Tạo phiếu kiểm kê kho (chụp System Qty từ tồn kho hiện tại)',
  })
  @ApiResponse({ status: 201, type: StockCountResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateStockCountDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<StockCountResponseDto> {
    return this.stockCountService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('stock_count:view')
  @ApiOperation({ summary: 'Danh sách phiếu kiểm kê kho — lọc, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedStockCountResponseDto })
  search(
    @Query() query: StockCountQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedStockCountResponseDto> {
    return this.stockCountService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('stock_count:view')
  @ApiOperation({ summary: 'Chi tiết phiếu kiểm kê kho' })
  @ApiResponse({ status: 200, type: StockCountResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<StockCountResponseDto> {
    return this.stockCountService.findOne(id, user.organizationId);
  }

  @Patch(':id/start')
  @RequirePermissions('stock_count:start')
  @ApiOperation({ summary: 'Bắt đầu kiểm kê (DRAFT → COUNTING)' })
  @ApiResponse({ status: 200, type: StockCountResponseDto })
  @ApiWriteErrors()
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<StockCountResponseDto> {
    return this.stockCountService.start(id, this.toActor(user, req));
  }

  @Patch(':id/complete')
  @RequirePermissions('stock_count:complete')
  @ApiOperation({
    summary:
      'Hoàn tất kiểm kê — ghi actualQty, sinh Adjustment/Movement nếu lệch',
  })
  @ApiResponse({ status: 200, type: StockCountResponseDto })
  @ApiWriteErrors()
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteStockCountDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<StockCountResponseDto> {
    return this.stockCountService.complete(id, dto, this.toActor(user, req));
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
