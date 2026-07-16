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
import { ActorContext, BrandService } from '../application/brand.service';
import { BrandQueryDto } from '../application/dto/brand-query.dto';
import {
  BrandResponseDto,
  PaginatedBrandResponseDto,
} from '../application/dto/brand-response.dto';
import { CreateBrandDto } from '../application/dto/create-brand.dto';
import { UpdateBrandDto } from '../application/dto/update-brand.dto';

@ApiTags('Brand')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @RequirePermissions('brand:create')
  @ApiOperation({ summary: 'Tạo thương hiệu mới' })
  @ApiResponse({ status: 201, type: BrandResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateBrandDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BrandResponseDto> {
    return this.brandService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('brand:view')
  @ApiOperation({
    summary: 'Danh sách thương hiệu — tìm kiếm, lọc, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedBrandResponseDto })
  search(
    @Query() query: BrandQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedBrandResponseDto> {
    return this.brandService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('brand:view')
  @ApiOperation({ summary: 'Chi tiết thương hiệu' })
  @ApiResponse({ status: 200, type: BrandResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BrandResponseDto> {
    return this.brandService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('brand:update')
  @ApiOperation({ summary: 'Cập nhật thương hiệu' })
  @ApiResponse({ status: 200, type: BrandResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BrandResponseDto> {
    return this.brandService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('brand:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mềm thương hiệu (chặn nếu còn sản phẩm)' })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.brandService.remove(id, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('brand:restore')
  @ApiOperation({
    summary:
      'Khôi phục thương hiệu đã xóa mềm — status luôn trả về INACTIVE, không tự động ACTIVE',
  })
  @ApiResponse({ status: 201, type: BrandResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BrandResponseDto> {
    return this.brandService.restore(id, this.toActor(user, req));
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
