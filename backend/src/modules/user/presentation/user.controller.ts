import {
  Body,
  Controller,
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
import { ActorContext, UserService } from '../application/user.service';
import { CreateUserDto } from '../application/dto/create-user.dto';
import { ResetUserPasswordDto } from '../application/dto/reset-user-password.dto';
import { UpdateUserDto } from '../application/dto/update-user.dto';
import { UserQueryDto } from '../application/dto/user-query.dto';
import {
  PaginatedUserResponseDto,
  UserDetailResponseDto,
  UserResponseDto,
} from '../application/dto/user-response.dto';

@ApiTags('User')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions('user:view')
  @ApiOperation({
    summary: 'Danh sách nhân viên — tìm, lọc trạng thái, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedUserResponseDto })
  search(
    @Query() query: UserQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedUserResponseDto> {
    return this.userService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('user:view')
  @ApiOperation({ summary: 'Chi tiết nhân viên kèm role codes hiện tại' })
  @ApiResponse({ status: 200, type: UserDetailResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<UserDetailResponseDto> {
    return this.userService.findOne(id, user.organizationId);
  }

  @Post()
  @RequirePermissions('user:create')
  @ApiOperation({
    summary:
      'Tạo nhân viên mới — admin đặt mật khẩu ban đầu (không self-service)',
  })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    return this.userService.create(dto, this.toActor(user, req));
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  @ApiOperation({
    summary: 'Cập nhật hồ sơ nhân viên (fullName/phone/avatar/branchId)',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    return this.userService.update(id, dto, this.toActor(user, req));
  }

  @Patch(':id/deactivate')
  @RequirePermissions('user:deactivate')
  @ApiOperation({
    summary:
      'Vô hiệu hóa nhân viên (ACTIVE → INACTIVE), thu hồi toàn bộ session',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiWriteErrors()
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    return this.userService.deactivate(id, this.toActor(user, req));
  }

  @Patch(':id/reactivate')
  @RequirePermissions('user:activate')
  @ApiOperation({ summary: 'Kích hoạt lại nhân viên (INACTIVE → ACTIVE)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiWriteErrors()
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    return this.userService.reactivate(id, this.toActor(user, req));
  }

  @Patch(':id/reset-password')
  @RequirePermissions('user:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Admin đặt lại mật khẩu cho nhân viên, thu hồi toàn bộ session',
  })
  @ApiWriteErrors()
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.userService.resetPassword(id, dto, this.toActor(user, req));
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
