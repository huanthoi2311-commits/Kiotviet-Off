import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../../common/swagger/api-common-errors.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { RbacService } from '../application/rbac.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';

@ApiTags('RBAC')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @RequirePermissions('permission:view')
  @ApiOperation({ summary: 'Danh mục quyền hệ thống (chỉ đọc, seed sẵn)' })
  list() {
    return this.rbacService.listPermissions();
  }
}
