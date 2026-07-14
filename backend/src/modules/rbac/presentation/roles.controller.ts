import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { RbacService } from '../application/rbac.service';
import { AssignPermissionsDto } from '../application/dto/assign-permissions.dto';
import { AssignRoleDto } from '../application/dto/assign-role.dto';
import { CreateRoleDto } from '../application/dto/create-role.dto';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

@ApiTags('RBAC')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('role:view')
  @ApiOperation({ summary: 'Danh sách vai trò trong tổ chức hiện tại' })
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.rbacService.listRoles(user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('role:view')
  @ApiOperation({ summary: 'Chi tiết vai trò kèm danh sách permission' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.rbacService.getRole(id);
  }

  @Post()
  @RequirePermissions('role:create')
  @ApiOperation({ summary: 'Tạo vai trò mới' })
  create(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(user.organizationId, dto);
  }

  @Post(':id/permissions')
  @RequirePermissions('role:update')
  @ApiOperation({
    summary: 'Gán (thay thế toàn bộ) danh sách permission cho vai trò',
  })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ) {
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
}
