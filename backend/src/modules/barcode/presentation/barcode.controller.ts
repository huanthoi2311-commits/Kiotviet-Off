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
import { ActorContext, BarcodeService } from '../application/barcode.service';
import { BarcodeQueryDto } from '../application/dto/barcode-query.dto';
import {
  BarcodeResponseDto,
  PaginatedBarcodeResponseDto,
} from '../application/dto/barcode-response.dto';
import { BarcodeVersionDto } from '../application/dto/barcode-version.dto';
import { UpdateBarcodeDto } from '../application/dto/update-barcode.dto';

@ApiTags('Barcode')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('barcodes')
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Get()
  @RequirePermissions('barcode:view')
  @ApiOperation({
    summary: 'Tra cứu mã vạch toàn tổ chức — tìm kiếm, lọc, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedBarcodeResponseDto })
  search(
    @Query() query: BarcodeQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedBarcodeResponseDto> {
    return this.barcodeService.search(query, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('barcode:update')
  @ApiOperation({ summary: 'Cập nhật mã vạch' })
  @ApiResponse({ status: 200, type: BarcodeResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBarcodeDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BarcodeResponseDto> {
    return this.barcodeService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('barcode:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Xóa mềm mã vạch — chặn nếu là mã mặc định và sản phẩm đang hoạt động',
  })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BarcodeVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.barcodeService.remove(id, dto.version, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('barcode:restore')
  @ApiOperation({
    summary:
      'Khôi phục mã vạch đã xóa mềm — status luôn trả về INACTIVE, không tự động ACTIVE',
  })
  @ApiResponse({ status: 201, type: BarcodeResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BarcodeVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BarcodeResponseDto> {
    return this.barcodeService.restore(
      id,
      dto.version,
      this.toActor(user, req),
    );
  }

  @Post(':id/default')
  @RequirePermissions('barcode:update')
  @ApiOperation({ summary: 'Đặt làm mã vạch mặc định của sản phẩm' })
  @ApiResponse({ status: 201, type: BarcodeResponseDto })
  @ApiWriteErrors()
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BarcodeVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BarcodeResponseDto> {
    return this.barcodeService.setDefault(
      id,
      dto.version,
      this.toActor(user, req),
    );
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
