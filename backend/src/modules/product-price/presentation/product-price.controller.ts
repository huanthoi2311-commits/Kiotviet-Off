import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  ActorContext,
  ProductPriceService,
} from '../application/product-price.service';
import { ProductPriceSetResponseDto } from '../application/dto/product-price-response.dto';
import { ReplaceProductPriceSetDto } from '../application/dto/replace-product-price-set.dto';

/**
 * SPEC-T043.07 §1 — dedicated resource, singleton per Product (không phải collection per-row).
 * Route nested dưới `products/:productId/prices`, đúng mẫu `ProductBarcodeController`
 * (`products/:productId/barcodes`, module `barcode`) — nhưng ở đây chỉ 2 thao tác (đọc/ghi toàn
 * bộ set), không có CRUD từng dòng (Architect Decision T043.06 §2/§3: set-level versioning,
 * bulk-replace, không PATCH-per-row).
 */
@ApiTags('Product Price')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products/:productId/prices')
export class ProductPriceController {
  constructor(private readonly productPriceService: ProductPriceService) {}

  @Get()
  @RequirePermissions('product:view')
  @ApiOperation({ summary: 'Đọc toàn bộ price set hiện tại của sản phẩm' })
  @ApiResponse({ status: 200, type: ProductPriceSetResponseDto })
  findSet(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProductPriceSetResponseDto> {
    return this.productPriceService.findSet(productId, user.organizationId);
  }

  @Patch()
  @RequirePermissions('product:update')
  @ApiOperation({
    summary:
      'Thay thế toàn bộ price set (bulk-replace) — Optimistic Lock qua priceVersion, tách khỏi Product.version',
  })
  @ApiResponse({ status: 200, type: ProductPriceSetResponseDto })
  @ApiWriteErrors()
  replaceSet(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: ReplaceProductPriceSetDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<ProductPriceSetResponseDto> {
    return this.productPriceService.replaceSet(
      productId,
      dto,
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
