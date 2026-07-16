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
import { ActorContext, CategoryService } from '../application/category.service';
import {
  CategoryResponseDto,
  CategoryTreeResponseDto,
  PaginatedCategoryResponseDto,
} from '../application/dto/category-response.dto';
import { CategoryQueryDto } from '../application/dto/category-query.dto';
import { CreateCategoryDto } from '../application/dto/create-category.dto';
import { UpdateCategoryDto } from '../application/dto/update-category.dto';

@ApiTags('Category')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @RequirePermissions('category:create')
  @ApiOperation({ summary: 'Tạo danh mục mới (slug tự sinh)' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('category:view')
  @ApiOperation({
    summary:
      'Danh sách danh mục dạng phẳng — tìm kiếm, lọc (status/parentId/isActive), phân trang, sắp xếp',
  })
  @ApiResponse({ status: 200, type: PaginatedCategoryResponseDto })
  list(
    @Query() query: CategoryQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedCategoryResponseDto> {
    return this.categoryService.list(query, user.organizationId);
  }

  @Get('tree')
  @RequirePermissions('category:view')
  @ApiOperation({ summary: 'Cây danh mục (unlimited level)' })
  @ApiResponse({ status: 200, type: [CategoryTreeResponseDto] })
  getTree(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CategoryTreeResponseDto[]> {
    return this.categoryService.getTree(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('category:view')
  @ApiOperation({ summary: 'Chi tiết danh mục' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('category:update')
  @ApiOperation({
    summary:
      'Cập nhật danh mục (kiểm tra vòng lặp cha-con) — bắt buộc gửi "version" hiện tại (Optimistic Lock); không cho set status=ARCHIVED qua route này, dùng DELETE',
  })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('category:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Lưu trữ danh mục (status → ARCHIVED, xóa mềm) — từ chối nếu còn sản phẩm hoặc danh mục con (ở bất kỳ cấp nào) đang hoạt động',
  })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.categoryService.remove(id, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('category:restore')
  @ApiOperation({
    summary:
      'Khôi phục danh mục đã xóa mềm — status luôn trả về INACTIVE; từ chối nếu còn tổ tiên đang bị lưu trữ (phải khôi phục từ trên xuống)',
  })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.restore(id, this.toActor(user, req));
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
