import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { ActorContext, BranchService } from '../application/branch.service';
import { BranchQueryDto } from '../application/dto/branch-query.dto';
import {
  BranchResponseDto,
  PaginatedBranchResponseDto,
} from '../application/dto/branch-response.dto';
import { CreateBranchDto } from '../application/dto/create-branch.dto';
import { UpdateBranchDto } from '../application/dto/update-branch.dto';

@ApiTags('Branch')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @RequirePermissions('branch:create')
  @ApiOperation({ summary: 'Tạo chi nhánh mới' })
  @ApiResponse({ status: 201, type: BranchResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BranchResponseDto> {
    return this.branchService.create(dto, this.toActor(user));
  }

  @Get()
  @RequirePermissions('branch:view')
  @ApiOperation({ summary: 'Danh sách chi nhánh, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedBranchResponseDto })
  search(
    @Query() query: BranchQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedBranchResponseDto> {
    return this.branchService.search(query, this.toActor(user));
  }

  @Get(':id')
  @RequirePermissions('branch:view')
  @ApiOperation({ summary: 'Xem chi tiết 1 chi nhánh' })
  @ApiResponse({ status: 200, type: BranchResponseDto })
  getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BranchResponseDto> {
    return this.branchService.getById(id, this.toActor(user));
  }

  @Patch(':id')
  @RequirePermissions('branch:update')
  @ApiOperation({ summary: 'Sửa thông tin chi nhánh (không đổi code)' })
  @ApiResponse({ status: 200, type: BranchResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BranchResponseDto> {
    return this.branchService.update(id, dto, this.toActor(user));
  }

  @Post(':id/archive')
  @RequirePermissions('branch:archive')
  @ApiOperation({
    summary:
      'Lưu trữ chi nhánh — chặn nếu còn Warehouse ACTIVE hoặc là chi nhánh ACTIVE cuối cùng',
  })
  @ApiResponse({ status: 201, type: BranchResponseDto })
  @ApiWriteErrors()
  archive(
    @Param('id') id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BranchResponseDto> {
    return this.branchService.archive(id, this.toActor(user));
  }

  @Post(':id/set-default')
  @RequirePermissions('branch:set-default')
  @ApiOperation({ summary: 'Đặt làm chi nhánh mặc định của tổ chức' })
  @ApiResponse({ status: 201, type: BranchResponseDto })
  @ApiWriteErrors()
  setDefault(
    @Param('id') id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BranchResponseDto> {
    return this.branchService.setDefault(id, this.toActor(user));
  }

  private toActor(user: JwtAccessPayload): ActorContext {
    return { userId: user.sub, organizationId: user.organizationId };
  }
}
