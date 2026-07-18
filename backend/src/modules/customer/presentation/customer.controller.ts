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
import { ActorContext, CustomerService } from '../application/customer.service';
import { CreateCustomerDto } from '../application/dto/create-customer.dto';
import { CustomerQueryDto } from '../application/dto/customer-query.dto';
import {
  CustomerResponseDto,
  PaginatedCustomerResponseDto,
} from '../application/dto/customer-response.dto';
import { CustomerVersionDto } from '../application/dto/customer-version.dto';
import { UpdateCustomerDto } from '../application/dto/update-customer.dto';

@ApiTags('Customer')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @RequirePermissions('customer:create')
  @ApiOperation({
    summary: 'Tạo khách hàng (mã tùy chọn — không gửi sẽ tự sinh CUSxxxxxx)',
  })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  @ApiWriteErrors()
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerResponseDto> {
    return this.customerService.create(dto, this.toActor(user, req));
  }

  @Get()
  @RequirePermissions('customer:view')
  @ApiOperation({
    summary:
      'Danh sách khách hàng — tìm theo tên/SĐT/email/công ty/MST, lọc, phân trang',
  })
  @ApiResponse({ status: 200, type: PaginatedCustomerResponseDto })
  search(
    @Query() query: CustomerQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedCustomerResponseDto> {
    return this.customerService.search(query, user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('customer:view')
  @ApiOperation({ summary: 'Chi tiết khách hàng' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<CustomerResponseDto> {
    return this.customerService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @RequirePermissions('customer:update')
  @ApiOperation({ summary: 'Cập nhật khách hàng' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  @ApiWriteErrors()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerResponseDto> {
    return this.customerService.update(id, dto, this.toActor(user, req));
  }

  @Post(':id/activate')
  @RequirePermissions('customer:activate')
  @ApiOperation({ summary: 'Kích hoạt khách hàng (INACTIVE → ACTIVE)' })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  @ApiWriteErrors()
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerResponseDto> {
    return this.customerService.activate(
      id,
      dto.version,
      this.toActor(user, req),
    );
  }

  @Post(':id/deactivate')
  @RequirePermissions('customer:deactivate')
  @ApiOperation({ summary: 'Ngừng hoạt động khách hàng (ACTIVE → INACTIVE)' })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  @ApiWriteErrors()
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerResponseDto> {
    return this.customerService.deactivate(
      id,
      dto.version,
      this.toActor(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('customer:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Lưu trữ (Archive) khách hàng — không hard delete' })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.customerService.remove(id, dto.version, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('customer:restore')
  @ApiOperation({
    summary:
      'Khôi phục khách hàng đã lưu trữ — status luôn trả về INACTIVE, không tự động ACTIVE',
  })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CustomerVersionDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerResponseDto> {
    return this.customerService.restore(
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
