import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import { ActorContext, SupplierService } from '../application/supplier.service';
import {
  SupplierExcelService,
  SupplierImportSummary,
} from '../application/supplier-excel.service';
import { CreateSupplierDto } from '../application/dto/create-supplier.dto';
import { SupplierQueryDto } from '../application/dto/supplier-query.dto';
import {
  PaginatedSupplierResponseDto,
  SupplierResponseDto,
} from '../application/dto/supplier-response.dto';
import { UpdateSupplierDto } from '../application/dto/update-supplier.dto';

@ApiTags('Supplier')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers')
export class SupplierController {
  constructor(
    private readonly supplierService: SupplierService,
    private readonly supplierExcelService: SupplierExcelService,
  ) {}

  @Post()
  @RequirePermissions('supplier:create')
  @ApiOperation({ summary: 'Tạo nhà cung cấp mới' })
  @ApiResponse({ status: 201, type: SupplierResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.create(dto, this.toActor(user, req));
  }

  @Post('import')
  @RequirePermissions('supplier:import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary:
      'Nhập nhà cung cấp từ file Excel — rollback toàn bộ nếu có dòng lỗi',
  })
  @ApiResponse({ status: 201 })
  @ApiWriteErrors()
  async import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierImportSummary> {
    if (!file?.buffer) {
      throw new BadRequestException(
        withCode(
          ErrorCode.SUPPLIER_IMPORT_INVALID_FILE,
          'Vui lòng chọn file Excel để nhập',
        ),
      );
    }
    return this.supplierExcelService.importFromExcel(
      file.buffer,
      this.toActor(user, req),
    );
  }

  @Get('export')
  @RequirePermissions('supplier:export')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="suppliers.xlsx"')
  @ApiOperation({
    summary:
      'Xuất danh sách nhà cung cấp ra file Excel (áp cùng bộ lọc với danh sách)',
  })
  async export(
    @Query() query: SupplierQueryDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.supplierExcelService.exportToExcel(
      query,
      this.toActor(user, req),
    );
    res.send(buffer);
  }

  @Get()
  @RequirePermissions('supplier:view')
  @ApiOperation({
    summary: 'Danh sách nhà cung cấp — tìm kiếm, lọc, phân trang, sắp xếp',
  })
  @ApiResponse({ status: 200, type: PaginatedSupplierResponseDto })
  search(
    @Query() query: SupplierQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedSupplierResponseDto> {
    return this.supplierService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('supplier:view')
  @ApiOperation({ summary: 'Chi tiết nhà cung cấp' })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('supplier:update')
  @ApiOperation({ summary: 'Cập nhật nhà cung cấp' })
  @ApiResponse({ status: 200, type: SupplierResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.update(id, dto, this.toActor(user, req));
  }

  @Delete(':id')
  @RequirePermissions('supplier:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa mềm nhà cung cấp (chặn nếu đã có đơn nhập hàng)',
  })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.supplierService.remove(id, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('supplier:restore')
  @ApiOperation({ summary: 'Khôi phục nhà cung cấp đã xóa mềm' })
  @ApiResponse({ status: 201, type: SupplierResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierResponseDto> {
    return this.supplierService.restore(id, this.toActor(user, req));
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
