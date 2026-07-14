import {
  Body,
  Controller,
  Get,
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
import { ActorContext, TransferService } from '../application/transfer.service';
import { CreateTransferDto } from '../application/dto/create-transfer.dto';
import { TransferQueryDto } from '../application/dto/transfer-query.dto';
import {
  PaginatedTransferResponseDto,
  TransferResponseDto,
} from '../application/dto/transfer-response.dto';

@ApiTags('Transfer')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  @RequirePermissions('transfer:create')
  @ApiOperation({ summary: 'Tạo phiếu điều chuyển kho' })
  @ApiResponse({ status: 201, type: TransferResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<TransferResponseDto> {
    return this.transferService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('transfer:view')
  @ApiOperation({
    summary: 'Danh sách phiếu điều chuyển kho — lọc, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedTransferResponseDto })
  search(
    @Query() query: TransferQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedTransferResponseDto> {
    return this.transferService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('transfer:view')
  @ApiOperation({ summary: 'Chi tiết phiếu điều chuyển kho' })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<TransferResponseDto> {
    return this.transferService.findOne(id, user.organizationId);
  }

  @Patch(':id/approve')
  @RequirePermissions('transfer:approve')
  @ApiOperation({
    summary: 'Duyệt phiếu — trừ tồn kho nguồn (PENDING → APPROVED)',
  })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  @ApiWriteErrors()
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<TransferResponseDto> {
    return this.transferService.approve(id, this.toActor(user, req));
  }

  @Patch(':id/receive')
  @RequirePermissions('transfer:receive')
  @ApiOperation({
    summary: 'Nhận hàng — cộng tồn kho đích (APPROVED → RECEIVED)',
  })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  @ApiWriteErrors()
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<TransferResponseDto> {
    return this.transferService.receive(id, this.toActor(user, req));
  }

  @Patch(':id/cancel')
  @RequirePermissions('transfer:cancel')
  @ApiOperation({ summary: 'Hủy phiếu (hoàn kho nguồn nếu đã Approve)' })
  @ApiResponse({ status: 200, type: TransferResponseDto })
  @ApiWriteErrors()
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<TransferResponseDto> {
    return this.transferService.cancel(id, this.toActor(user, req));
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
