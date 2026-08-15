import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
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
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { RequireEntitlement } from '../../entitlement/presentation/entitlement.decorator';
import { EntitlementGuard } from '../../entitlement/presentation/entitlement.guard';
import { RbacService } from '../application/rbac.service';
import { AssignPermissionsDto } from '../application/dto/assign-permissions.dto';
import { AssignRoleDto } from '../application/dto/assign-role.dto';
import { CreateRoleDto } from '../application/dto/create-role.dto';
import {
  RoleResponseDto,
  RoleWithPermissionsResponseDto,
} from '../application/dto/role-response.dto';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

@ApiTags('RBAC')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, EntitlementGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('role:view')
  @ApiOperation({ summary: 'Danh sách vai trò trong tổ chức hiện tại' })
  @ApiResponse({ status: 200, type: [RoleResponseDto] })
  list(@CurrentUser() user: JwtAccessPayload): Promise<RoleResponseDto[]> {
    return this.rbacService.listRoles(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('role:view')
  @ApiOperation({ summary: 'Chi tiết vai trò kèm danh sách permission' })
  @ApiResponse({ status: 200, type: RoleWithPermissionsResponseDto })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<RoleWithPermissionsResponseDto> {
    return this.rbacService.getRole(id, user.organizationId);
  }

  @Post()
  @RequireEntitlement('RBAC_MANAGEMENT')
  @RequirePermissions('role:create')
  @ApiOperation({ summary: 'Tạo vai trò mới' })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rbacService.createRole(user.organizationId, dto);
  }

  @Post(':id/permissions')
  @RequirePermissions('role:update')
  @ApiOperation({
    summary: 'Gán (thay thế toàn bộ) danh sách permission cho vai trò',
  })
  @ApiResponse({ status: 201, type: RoleWithPermissionsResponseDto })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<RoleWithPermissionsResponseDto> {
    return this.rbacService.assignPermissions(id, dto.permissionCodes, {
      userId: user.sub,
      organizationId: user.organizationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('assign')
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Gán vai trò cho người dùng' })
  assignToUser(
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ) {
    return this.rbacService.assignRoleToUser(dto.userId, dto.roleId, {
      userId: user.sub,
      organizationId: user.organizationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Delete(':roleId/users/:userId')
  @RequirePermissions('user:update')
  @HttpCode(204)
  @ApiOperation({ summary: 'Gỡ vai trò khỏi người dùng' })
  removeFromUser(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ) {
    return this.rbacService.removeRoleFromUser(userId, roleId, {
      userId: user.sub,
      organizationId: user.organizationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
