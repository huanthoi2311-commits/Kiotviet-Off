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
import { BarcodeResponseDto } from '../application/dto/barcode-response.dto';
import { CreateBarcodeDto } from '../application/dto/create-barcode.dto';

@ApiTags('Barcode')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products/:productId/barcodes')
export class ProductBarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Get()
  @RequirePermissions('barcode:view')
  @ApiOperation({ summary: 'Danh sách mã vạch của sản phẩm' })
  @ApiResponse({ status: 200, type: [BarcodeResponseDto] })
  list(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<BarcodeResponseDto[]> {
    return this.barcodeService.listByProduct(productId, user.organizationId);
  }

  @Post()
  @RequirePermissions('barcode:create')
  @ApiOperation({ summary: 'Thêm mã vạch mới cho sản phẩm' })
  @ApiResponse({ status: 201, type: BarcodeResponseDto })
  @ApiWriteErrors()
  create(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateBarcodeDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<BarcodeResponseDto> {
    return this.barcodeService.create(productId, dto, this.toActor(user, req));
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
