import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { InventoryService } from '../application/inventory.service';
import { InventoryQueryDto } from '../application/dto/inventory-query.dto';
import {
  InventoryResponseDto,
  PaginatedInventoryResponseDto,
} from '../application/dto/inventory-response.dto';
import { MovementQueryDto } from '../application/dto/movement-query.dto';
import { PaginatedInventoryMovementResponseDto } from '../application/dto/movement-response.dto';

/**
 * Chỉ đọc — không có POST/PATCH/DELETE. Tồn kho không được phép thay đổi qua API;
 * chỉ được sinh ra bởi các module nghiệp vụ (Purchase, POS, Transfer, Stock Count,
 * Adjustment) gọi InventoryDomainService (Single Writer — SPEC-INV-001).
 */
@ApiTags('Inventory')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:view')
  @ApiOperation({
    summary: 'Tồn kho hiện tại — lọc theo kho/sản phẩm, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedInventoryResponseDto })
  search(
    @Query() query: InventoryQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedInventoryResponseDto> {
    return this.inventoryService.search(query, user.organizationId);
  }

  @Get('history')
  @RequirePermissions('inventory:view')
  @ApiOperation({
    summary: 'Lịch sử biến động tồn kho (InventoryMovement ledger)',
  })
  @ApiResponse({ status: 200, type: PaginatedInventoryMovementResponseDto })
  getHistory(
    @Query() query: MovementQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedInventoryMovementResponseDto> {
    return this.inventoryService.getHistory(query, user.organizationId);
  }

  @Get('product/:id')
  @RequirePermissions('inventory:view')
  @ApiOperation({ summary: 'Tồn kho của 1 sản phẩm tại tất cả các kho' })
  @ApiResponse({ status: 200, type: [InventoryResponseDto] })
  getByProduct(
    @Param('id', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<InventoryResponseDto[]> {
    return this.inventoryService.getByProduct(productId, user.organizationId);
  }
}
