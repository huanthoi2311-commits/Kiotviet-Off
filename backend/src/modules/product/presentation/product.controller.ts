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
import { ActorContext, ProductService } from '../application/product.service';
import { CreateProductDto } from '../application/dto/create-product.dto';
import {
  PaginatedProductResponseDto,
  ProductResponseDto,
} from '../application/dto/product-response.dto';
import { ProductQueryDto } from '../application/dto/product-query.dto';
import { UpdateProductDto } from '../application/dto/update-product.dto';

@ApiTags('Product')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @RequirePermissions('product:create')
  @ApiOperation({
    summary: 'Tạo sản phẩm mới (SKU/slug tự sinh, kèm giá/ảnh/barcode ban đầu)',
  })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<ProductResponseDto> {
    return this.productService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('product:view')
  @ApiOperation({
    summary:
      'Danh sách sản phẩm — tìm kiếm, lọc (type/status/categoryId/brandId/unitId/parentProductId/keyword), phân trang, sắp xếp',
  })
  @ApiResponse({ status: 200, type: PaginatedProductResponseDto })
  @ApiCommonErrors()
  search(
    @Query() query: ProductQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedProductResponseDto> {
    return this.productService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('product:view')
  @ApiOperation({ summary: 'Chi tiết sản phẩm' })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiCommonErrors()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProductResponseDto> {
    return this.productService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('product:update')
  @ApiOperation({
    summary:
      'Cập nhật sản phẩm — bắt buộc gửi "version" hiện tại (Optimistic Lock, SPEC-PRODUCT-001 §7.1); sai version bị từ chối 409',
  })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<ProductResponseDto> {
    return this.productService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('product:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Lưu trữ sản phẩm (status → ARCHIVED, xóa mềm, có thể khôi phục sau) — từ chối nếu còn Variant Child đang hoạt động',
  })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.productService.remove(id, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('product:restore')
  @ApiOperation({
    summary:
      'Khôi phục sản phẩm đã xóa mềm — status luôn trả về INACTIVE (không tự động ACTIVE), gọi PATCH riêng để kích hoạt lại',
  })
  @ApiResponse({ status: 200, type: ProductResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<ProductResponseDto> {
    return this.productService.restore(id, this.toActor(user, req));
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
