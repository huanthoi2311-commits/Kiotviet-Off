import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { SupplierProductService } from '../application/supplier-product.service';
import { ActorContext } from '../application/supplier.service';
import { SupplierProductResponseDto } from '../application/dto/supplier-product-response.dto';
import { UpsertSupplierProductDto } from '../application/dto/upsert-supplier-product.dto';

/** Quản lý ánh xạ Many-to-Many Supplier↔Product — không có trong API list gốc của Prompt 026, bổ sung để hiện thực "Supplier Product Mapping" đã nêu ở Functional Requirements. */
@ApiTags('SupplierProduct')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers/:supplierId/products')
export class SupplierProductController {
  constructor(
    private readonly supplierProductService: SupplierProductService,
  ) {}

  @Get()
  @RequirePermissions('supplier:view')
  @ApiOperation({ summary: 'Danh sách sản phẩm được gán cho nhà cung cấp' })
  @ApiResponse({ status: 200, type: [SupplierProductResponseDto] })
  list(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SupplierProductResponseDto[]> {
    return this.supplierProductService.listBySupplier(
      supplierId,
      user.organizationId,
    );
  }

  @Post()
  @RequirePermissions('supplier:update')
  @ApiOperation({
    summary: 'Gán (hoặc cập nhật) một sản phẩm cho nhà cung cấp',
  })
  @ApiResponse({ status: 201, type: SupplierProductResponseDto })
  @ApiWriteErrors()
  upsert(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: UpsertSupplierProductDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierProductResponseDto> {
    return this.supplierProductService.upsert(
      supplierId,
      dto,
      this.toActor(user, req),
    );
  }

  @Delete(':productId')
  @RequirePermissions('supplier:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ gán sản phẩm khỏi nhà cung cấp' })
  @ApiWriteErrors()
  async remove(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.supplierProductService.remove(
      supplierId,
      productId,
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
