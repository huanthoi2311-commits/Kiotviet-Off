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
  PurchaseReturnService,
} from '../application/purchase-return.service';
import { CreatePurchaseReturnDto } from '../application/dto/create-purchase-return.dto';
import { PurchaseReturnQueryDto } from '../application/dto/purchase-return-query.dto';
import {
  PaginatedPurchaseReturnResponseDto,
  PurchaseReturnResponseDto,
} from '../application/dto/purchase-return-response.dto';

/**
 * Route dùng dạng số nhiều `/purchase-returns` nhất quán với mọi resource khác trong
 * toàn hệ thống (suppliers, purchase-orders, warehouses, ...) — Prompt 028 viết
 * `POST /purchase-return` (số ít), hiểu là chưa nhất quán trong văn bản Prompt, không
 * phải một quy ước route mới có chủ đích.
 */
@ApiTags('PurchaseReturn')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-returns')
export class PurchaseReturnController {
  constructor(private readonly purchaseReturnService: PurchaseReturnService) {}

  @Post()
  @RequirePermissions('purchase_return:create')
  @ApiOperation({
    summary: 'Tạo phiếu trả hàng nhà cung cấp (trạng thái DRAFT)',
  })
  @ApiResponse({ status: 201, type: PurchaseReturnResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseReturnService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('purchase_return:view')
  @ApiOperation({ summary: 'Danh sách phiếu trả hàng — lọc, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedPurchaseReturnResponseDto })
  search(
    @Query() query: PurchaseReturnQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedPurchaseReturnResponseDto> {
    return this.purchaseReturnService.search(query, user.organizationId);
  }

  /** Không có trong API list gốc của Prompt 028 (chỉ liệt kê GET danh sách) — bổ sung tối thiểu để xem chi tiết trước khi Approve/Complete, cùng lý do đã áp dụng ở Purchase Order. */
  @Get(':id')
  @RequirePermissions('purchase_return:view')
  @ApiOperation({ summary: 'Chi tiết phiếu trả hàng' })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseReturnService.findOne(id, user.organizationId);
  }

  @Patch(':id/approve')
  @RequirePermissions('purchase_return:approve')
  @ApiOperation({ summary: 'Duyệt phiếu trả hàng (DRAFT → APPROVED)' })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  @ApiWriteErrors()
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseReturnService.approve(id, this.toActor(user, req));
  }

  @Patch(':id/complete')
  @RequirePermissions('purchase_return:complete')
  @ApiOperation({
    summary:
      'Hoàn tất — Inventory Out (InventoryMovement RETURN) + giảm công nợ NCC (APPROVED → COMPLETED)',
  })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  @ApiWriteErrors()
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseReturnService.complete(id, this.toActor(user, req));
  }

  /** Không có trong API list gốc của Prompt 028 — bổ sung để có lối thoát an toàn cho phiếu tạo nhầm, cùng mẫu đã áp dụng ở mọi module workflow trước (Transfer/StockCount/Adjustment/PurchaseOrder). */
  @Patch(':id/cancel')
  @RequirePermissions('purchase_return:cancel')
  @ApiOperation({ summary: 'Hủy phiếu trả hàng (chưa Complete)' })
  @ApiResponse({ status: 200, type: PurchaseReturnResponseDto })
  @ApiWriteErrors()
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<PurchaseReturnResponseDto> {
    return this.purchaseReturnService.cancel(id, this.toActor(user, req));
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
