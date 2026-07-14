import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  WarehouseService,
} from '../application/warehouse.service';
import { CreateWarehouseDto } from '../application/dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../application/dto/update-warehouse.dto';
import { WarehouseQueryDto } from '../application/dto/warehouse-query.dto';
import {
  PaginatedWarehouseResponseDto,
  WarehouseResponseDto,
} from '../application/dto/warehouse-response.dto';

@ApiTags('Warehouse')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @RequirePermissions('warehouse:create')
  @ApiOperation({ summary: 'Tạo kho mới' })
  @ApiResponse({ status: 201, type: WarehouseResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<WarehouseResponseDto> {
    return this.warehouseService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('warehouse:view')
  @ApiOperation({
    summary: 'Danh sách kho — tìm kiếm, lọc, phân trang, sắp xếp',
  })
  @ApiResponse({ status: 200, type: PaginatedWarehouseResponseDto })
  search(
    @Query() query: WarehouseQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedWarehouseResponseDto> {
    return this.warehouseService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('warehouse:view')
  @ApiOperation({ summary: 'Chi tiết kho' })
  @ApiResponse({ status: 200, type: WarehouseResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<WarehouseResponseDto> {
    return this.warehouseService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('warehouse:update')
  @ApiOperation({ summary: 'Cập nhật kho' })
  @ApiResponse({ status: 200, type: WarehouseResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<WarehouseResponseDto> {
    return this.warehouseService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('warehouse:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa mềm kho (chặn nếu còn tồn kho hoặc giao dịch)',
  })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.warehouseService.remove(id, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('warehouse:restore')
  @ApiOperation({ summary: 'Khôi phục kho đã xóa mềm' })
  @ApiResponse({ status: 201, type: WarehouseResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<WarehouseResponseDto> {
    return this.warehouseService.restore(id, this.toActor(user, req));
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
