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
  InventoryAdjustmentService,
} from '../application/inventory-adjustment.service';
import { CreateInventoryAdjustmentDto } from '../application/dto/create-inventory-adjustment.dto';
import { InventoryAdjustmentQueryDto } from '../application/dto/inventory-adjustment-query.dto';
import {
  InventoryAdjustmentResponseDto,
  PaginatedInventoryAdjustmentResponseDto,
} from '../application/dto/inventory-adjustment-response.dto';

@ApiTags('InventoryAdjustment')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory-adjustments')
export class InventoryAdjustmentController {
  constructor(private readonly adjustmentService: InventoryAdjustmentService) {}

  @Post()
  @RequirePermissions('inventory:adjust')
  @ApiOperation({
    summary:
      'Tạo phiếu điều chỉnh tồn kho (chỉ dùng khi sai lệch, không dùng để bán hàng)',
  })
  @ApiResponse({ status: 201, type: InventoryAdjustmentResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<InventoryAdjustmentResponseDto> {
    return this.adjustmentService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('inventory:view')
  @ApiOperation({
    summary: 'Danh sách phiếu điều chỉnh tồn kho — lọc, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedInventoryAdjustmentResponseDto })
  search(
    @Query() query: InventoryAdjustmentQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedInventoryAdjustmentResponseDto> {
    return this.adjustmentService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('inventory:view')
  @ApiOperation({ summary: 'Chi tiết phiếu điều chỉnh tồn kho' })
  @ApiResponse({ status: 200, type: InventoryAdjustmentResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<InventoryAdjustmentResponseDto> {
    return this.adjustmentService.findOne(id, user.organizationId);
  }

  @Patch(':id/submit')
  @RequirePermissions('inventory:adjust')
  @ApiOperation({ summary: 'Gửi phiếu chờ duyệt (DRAFT → SUBMITTED)' })
  @ApiResponse({ status: 200, type: InventoryAdjustmentResponseDto })
  @ApiWriteErrors()
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<InventoryAdjustmentResponseDto> {
    return this.adjustmentService.submit(id, this.toActor(user, req));
  }

  @Patch(':id/approve')
  @RequirePermissions('inventory:approve')
  @ApiOperation({ summary: 'Duyệt phiếu (SUBMITTED → APPROVED)' })
  @ApiResponse({ status: 200, type: InventoryAdjustmentResponseDto })
  @ApiWriteErrors()
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<InventoryAdjustmentResponseDto> {
    return this.adjustmentService.approve(id, this.toActor(user, req));
  }

  @Patch(':id/complete')
  @RequirePermissions('inventory:complete')
  @ApiOperation({
    summary:
      'Hoàn tất — sinh InventoryMovement, đồng bộ tồn kho (APPROVED → COMPLETED)',
  })
  @ApiResponse({ status: 200, type: InventoryAdjustmentResponseDto })
  @ApiWriteErrors()
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<InventoryAdjustmentResponseDto> {
    return this.adjustmentService.complete(id, this.toActor(user, req));
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
