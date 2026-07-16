import {
  Body,
  Controller,
  Get,
  Param,
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
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import {
  ActorContext,
  OrganizationService,
} from '../application/organization.service';
import { ArchiveOrganizationDto } from '../application/dto/archive-organization.dto';
import { CreateOrganizationDto } from '../application/dto/create-organization.dto';
import {
  OrganizationDetailResponseDto,
  OrganizationResponseDto,
  PaginatedOrganizationResponseDto,
} from '../application/dto/organization-response.dto';
import { OrganizationQueryDto } from '../application/dto/organization-query.dto';
import { TransferOwnerDto } from '../application/dto/transfer-owner.dto';
import { UpdateOrganizationDto } from '../application/dto/update-organization.dto';
import { PlatformAdminGuard } from './guards/platform-admin.guard';

@ApiTags('Organization')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard)
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Tạo tổ chức mới kèm Owner (chỉ Platform Admin)' })
  @ApiResponse({ status: 201, type: OrganizationDetailResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<OrganizationDetailResponseDto> {
    return this.organizationService.create(dto, this.toActor(user, req));
  }

  @Get()
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Danh sách toàn bộ tổ chức (chỉ Platform Admin)' })
  @ApiResponse({ status: 200, type: PaginatedOrganizationResponseDto })
  search(
    @Query() query: OrganizationQueryDto,
  ): Promise<PaginatedOrganizationResponseDto> {
    return this.organizationService.search(query);
  }

  @Get('current')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('organization:view')
  @ApiOperation({ summary: 'Xem tổ chức của user đang đăng nhập' })
  @ApiResponse({ status: 200, type: OrganizationDetailResponseDto })
  getCurrent(
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<OrganizationDetailResponseDto> {
    return this.organizationService.getCurrent(this.toActor(user));
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('organization:view')
  @ApiOperation({ summary: 'Xem chi tiết 1 tổ chức' })
  @ApiResponse({ status: 200, type: OrganizationDetailResponseDto })
  getById(
    @Param('id') id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<OrganizationDetailResponseDto> {
    return this.organizationService.getById(id, this.toActor(user));
  }

  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('organization:update')
  @ApiOperation({
    summary: 'Sửa thông tin tổ chức (không đổi code/slug/status)',
  })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<OrganizationResponseDto> {
    return this.organizationService.update(id, dto, this.toActor(user));
  }

  @Post(':id/archive')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('organization:archive')
  @ApiOperation({
    summary: 'Lưu trữ (Archive) tổ chức — không xóa cứng, xác nhận 2 bước',
  })
  @ApiResponse({ status: 201, type: OrganizationResponseDto })
  @ApiWriteErrors()
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveOrganizationDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<OrganizationResponseDto> {
    return this.organizationService.archive(id, dto, this.toActor(user));
  }

  @Post(':id/transfer-owner')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('organization:transfer-owner')
  @ApiOperation({
    summary: 'Chuyển quyền sở hữu tổ chức cho 1 User khác trong cùng tổ chức',
  })
  @ApiResponse({ status: 201, type: OrganizationResponseDto })
  @ApiWriteErrors()
  transferOwner(
    @Param('id') id: string,
    @Body() dto: TransferOwnerDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<OrganizationResponseDto> {
    return this.organizationService.transferOwner(id, dto, this.toActor(user));
  }

  private toActor(user: JwtAccessPayload, req?: Request): ActorContext {
    return {
      userId: user.sub,
      organizationId: user.organizationId,
      isPlatformAdmin: user.isPlatformAdmin,
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    };
  }
}
