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
  @ApiOperation({ summary: 'Tạo khách hàng (mã tự sinh CUSxxxxxx)' })
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

  @Delete(':id')
  @RequirePermissions('customer:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mềm khách hàng' })
  @ApiWriteErrors()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<void> {
    await this.customerService.remove(id, this.toActor(user, req));
  }

  @Post(':id/restore')
  @RequirePermissions('customer:restore')
  @ApiOperation({ summary: 'Khôi phục khách hàng đã xóa mềm' })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  @ApiWriteErrors()
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<CustomerResponseDto> {
    return this.customerService.restore(id, this.toActor(user, req));
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
