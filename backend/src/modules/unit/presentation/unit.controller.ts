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
import { ActorContext, UnitService } from '../application/unit.service';
import { UnitQueryDto } from '../application/dto/unit-query.dto';
import {
  PaginatedUnitResponseDto,
  UnitResponseDto,
} from '../application/dto/unit-response.dto';
import { CreateUnitDto } from '../application/dto/create-unit.dto';
import { UpdateUnitDto } from '../application/dto/update-unit.dto';

@ApiTags('Unit')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('units')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Post()
  @RequirePermissions('unit:create')
  @ApiOperation({ summary: 'Tạo đơn vị tính mới' })
  @ApiResponse({ status: 201, type: UnitResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateUnitDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<UnitResponseDto> {
    return this.unitService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('unit:view')
  @ApiOperation({ summary: 'Danh sách đơn vị tính — tìm kiếm, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedUnitResponseDto })
  search(
    @Query() query: UnitQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedUnitResponseDto> {
    return this.unitService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('unit:view')
  @ApiOperation({ summary: 'Chi tiết đơn vị tính' })
  @ApiResponse({ status: 200, type: UnitResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<UnitResponseDto> {
    return this.unitService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('unit:update')
  @ApiOperation({ summary: 'Cập nhật đơn vị tính' })
  @ApiResponse({ status: 200, type: UnitResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<UnitResponseDto> {
    return this.unitService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('unit:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mềm đơn vị tính (chặn nếu còn sản phẩm)' })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.unitService.remove(id, this.toActor(user, req));
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
