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
  PurchaseOrderService,
} from '../application/purchase-order.service';
import { CreatePurchaseOrderDto } from '../application/dto/create-purchase-order.dto';
import { PurchaseOrderQueryDto } from '../application/dto/purchase-order-query.dto';
import {
  PaginatedPurchaseOrderResponseDto,
  PurchaseOrderResponseDto,
} from '../application/dto/purchase-order-response.dto';

@ApiTags('PurchaseOrder')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Post()
  @RequirePermissions('purchase:create')
  @ApiOperation({ summary: 'Tạo đơn nhập hàng (trạng thái DRAFT)' })
  @ApiResponse({ status: 201, type: PurchaseOrderResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('purchase:view')
  @ApiOperation({ summary: 'Danh sách đơn nhập hàng — lọc, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedPurchaseOrderResponseDto })
  search(
    @Query() query: PurchaseOrderQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedPurchaseOrderResponseDto> {
    return this.purchaseOrderService.search(query, user.organizationId);
  }

  /** Không có trong API list gốc của Prompt 027 (chỉ liệt kê GET danh sách) — bổ sung tối thiểu để xem chi tiết trước khi Approve/Receive. */
  @Get(':id')
  @RequirePermissions('purchase:view')
  @ApiOperation({ summary: 'Chi tiết đơn nhập hàng' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.findOne(id, user.organizationId);
  }

  @Patch(':id/approve')
  @RequirePermissions('purchase:approve')
  @ApiOperation({ summary: 'Duyệt đơn nhập hàng (DRAFT → APPROVED)' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  @ApiWriteErrors()
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.approve(id, this.toActor(user, req));
  }

  @Patch(':id/receive')
  @RequirePermissions('purchase:receive')
  @ApiOperation({
    summary:
      'Nhận hàng — sinh InventoryMovement, đồng bộ tồn kho + Average Cost (APPROVED → RECEIVED)',
  })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  @ApiWriteErrors()
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.receive(id, this.toActor(user, req));
  }

  @Patch(':id/cancel')
  @RequirePermissions('purchase:cancel')
  @ApiOperation({ summary: 'Hủy đơn nhập hàng (chưa Receive)' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponseDto })
  @ApiWriteErrors()
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseOrderResponseDto> {
    return this.purchaseOrderService.cancel(id, this.toActor(user, req));
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
