import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  SalesReturnService,
} from '../application/sales-return.service';
import { RefundDomainService } from '../application/refund-domain.service';
import {
  CreateSalesReturnDto,
  UpdateSalesReturnDraftDto,
} from '../application/dto/create-sales-return.dto';
import { CreateSalesReturnRefundDto } from '../application/dto/create-sales-return-refund.dto';
import {
  FailSalesReturnRefundDto,
  VersionedActionDto,
} from '../application/dto/versioned-action.dto';
import { SalesReturnQueryDto } from '../application/dto/sales-return-query.dto';
import {
  PaginatedSalesReturnResponseDto,
  SalesReturnEligibilityResponseDto,
  SalesReturnRefundResponseDto,
  SalesReturnResponseDto,
} from '../application/dto/sales-return-response.dto';
import { SalesReturnMapper } from '../application/mappers/sales-return.mapper';

/** T053.06E — độ dài tối đa Idempotency-Key (sau khi trim), mirror Supplier Payment (T052.05B D2). */
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/**
 * SPEC-T014-SALES-RETURN-EXCHANGE-001 §4 — route `/sales-returns/eligibility` (literal) PHẢI
 * đăng ký TRƯỚC `/sales-returns/:id` (param) để Nest không khớp nhầm "eligibility" thành `:id`.
 */
@ApiTags('SalesReturn')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sales-returns')
export class SalesReturnController {
  constructor(
    private readonly salesReturnService: SalesReturnService,
    private readonly refundDomainService: RefundDomainService,
  ) {}

  @Post()
  @RequirePermissions('sales_return:create')
  @ApiOperation({ summary: 'Tạo phiếu trả hàng (trạng thái DRAFT)' })
  @ApiResponse({ status: 201, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async create(
    @Body() dto: CreateSalesReturnDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const created = await this.salesReturnService.create(
      { invoiceId: dto.invoiceId, note: dto.note ?? null, items: dto.items },
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(created);
  }

  @Get()
  @RequirePermissions('sales_return:view')
  @ApiOperation({ summary: 'Danh sách phiếu trả hàng — lọc, phân trang' })
  @ApiResponse({ status: 200, type: PaginatedSalesReturnResponseDto })
  async search(
    @Query() query: SalesReturnQueryDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PaginatedSalesReturnResponseDto> {
    const result = await this.salesReturnService.search({
      organizationId: user.organizationId,
      invoiceId: query.invoiceId,
      status: query.status,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return SalesReturnMapper.toPaginatedResponseDto(result);
  }

  @Get('eligibility')
  @RequirePermissions('sales_return:view')
  @ApiOperation({
    summary:
      'GetInvoiceReturnEligibility — Eligible Quantity còn lại của từng dòng hàng (advisory, SPEC §16)',
  })
  @ApiResponse({ status: 200, type: [SalesReturnEligibilityResponseDto] })
  async eligibility(
    @Query('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnEligibilityResponseDto[]> {
    const result = await this.salesReturnService.getInvoiceEligibility(
      invoiceId,
      user.organizationId,
    );
    return result.map((item) =>
      SalesReturnMapper.toEligibilityResponseDto(item),
    );
  }

  @Get(':id')
  @RequirePermissions('sales_return:view')
  @ApiOperation({ summary: 'Chi tiết phiếu trả hàng' })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const found = await this.salesReturnService.findOne(
      id,
      user.organizationId,
    );
    return SalesReturnMapper.toResponseDto(found);
  }

  @Patch(':id')
  @RequirePermissions('sales_return:update')
  @ApiOperation({ summary: 'Sửa phiếu trả hàng (chỉ khi DRAFT)' })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async updateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesReturnDraftDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const updated = await this.salesReturnService.updateDraft(
      id,
      dto.version,
      { note: dto.note, items: dto.items },
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(updated);
  }

  @Post(':id/submit')
  @RequirePermissions('sales_return:submit')
  @ApiOperation({ summary: 'Gửi phiếu trả hàng chờ duyệt (DRAFT → SUBMITTED)' })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const updated = await this.salesReturnService.submit(
      id,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(updated);
  }

  @Post(':id/approve')
  @RequirePermissions('sales_return:approve')
  @ApiOperation({ summary: 'Duyệt phiếu trả hàng (SUBMITTED → APPROVED)' })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const updated = await this.salesReturnService.approve(
      id,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(updated);
  }

  @Post(':id/receive')
  @RequirePermissions('sales_return:receive')
  @ApiOperation({
    summary:
      'Nhận hàng trả — khóa InvoiceItem + phục hồi tồn kho (APPROVED → RECEIVED, Decision AD44)',
  })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const updated = await this.salesReturnService.receive(
      id,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(updated);
  }

  @Post(':id/complete')
  @RequirePermissions('sales_return:complete')
  @ApiOperation({ summary: 'Hoàn tất phiếu trả hàng (RECEIVED → COMPLETED)' })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const updated = await this.salesReturnService.complete(
      id,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(updated);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales_return:cancel')
  @ApiOperation({
    summary: 'Hủy phiếu trả hàng ([DRAFT,SUBMITTED,APPROVED] → CANCELLED)',
  })
  @ApiResponse({ status: 200, type: SalesReturnResponseDto })
  @ApiWriteErrors()
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnResponseDto> {
    const updated = await this.salesReturnService.cancel(
      id,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toResponseDto(updated);
  }

  @Post(':id/refunds')
  @RequirePermissions('sales_return:refund')
  @ApiOperation({
    summary:
      'Tạo hoàn tiền cho phiếu trả hàng (Decision AD37 — độc lập Payment). Bắt buộc header Idempotency-Key (T053.06E).',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Do client tự sinh — cùng key + cùng payload sẽ trả lại đúng refund cũ, không tạo giao dịch mới. Sau khi trim: không rỗng, tối đa 255 ký tự. Không yêu cầu định dạng UUID (mirror T052.05B D2).',
  })
  @ApiResponse({ status: 201, type: SalesReturnRefundResponseDto })
  @ApiWriteErrors()
  async createRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSalesReturnRefundDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnRefundResponseDto> {
    const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);
    const created = await this.refundDomainService.createRefund(
      {
        salesReturnId: id,
        amount: dto.amount,
        method: dto.method,
        externalReference: dto.externalReference ?? null,
      },
      this.toActor(user),
      normalizedKey,
    );
    return SalesReturnMapper.toRefundResponseDto(created);
  }

  @Post('refunds/:refundId/process')
  @RequirePermissions('sales_return:refund')
  @ApiOperation({ summary: 'Xử lý hoàn tiền (PENDING → PROCESSING)' })
  @ApiResponse({ status: 200, type: SalesReturnRefundResponseDto })
  @ApiWriteErrors()
  async processRefund(
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnRefundResponseDto> {
    const updated = await this.refundDomainService.process(
      refundId,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toRefundResponseDto(updated);
  }

  @Post('refunds/:refundId/complete')
  @RequirePermissions('sales_return:refund')
  @ApiOperation({ summary: 'Hoàn tất hoàn tiền (PROCESSING → COMPLETED)' })
  @ApiResponse({ status: 200, type: SalesReturnRefundResponseDto })
  @ApiWriteErrors()
  async completeRefund(
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnRefundResponseDto> {
    const updated = await this.refundDomainService.complete(
      refundId,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toRefundResponseDto(updated);
  }

  @Post('refunds/:refundId/fail')
  @RequirePermissions('sales_return:refund')
  @ApiOperation({
    summary: 'Đánh dấu hoàn tiền thất bại (PROCESSING → FAILED)',
  })
  @ApiResponse({ status: 200, type: SalesReturnRefundResponseDto })
  @ApiWriteErrors()
  async failRefund(
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Body() dto: FailSalesReturnRefundDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnRefundResponseDto> {
    const updated = await this.refundDomainService.fail(
      refundId,
      dto.version,
      dto.failureReason,
      this.toActor(user),
    );
    return SalesReturnMapper.toRefundResponseDto(updated);
  }

  @Post('refunds/:refundId/cancel')
  @RequirePermissions('sales_return:refund')
  @ApiOperation({ summary: 'Hủy hoàn tiền (PENDING → CANCELLED)' })
  @ApiResponse({ status: 200, type: SalesReturnRefundResponseDto })
  @ApiWriteErrors()
  async cancelRefund(
    @Param('refundId', ParseUUIDPipe) refundId: string,
    @Body() dto: VersionedActionDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SalesReturnRefundResponseDto> {
    const updated = await this.refundDomainService.cancel(
      refundId,
      dto.version,
      this.toActor(user),
    );
    return SalesReturnMapper.toRefundResponseDto(updated);
  }

  private toActor(user: JwtAccessPayload): ActorContext {
    return { userId: user.sub, organizationId: user.organizationId };
  }

  /** T053.06E — mirror `SupplierPaymentController.normalizeIdempotencyKey()`, nhưng gộp
   * missing+oversized vào CHUNG 1 mã lỗi (§5/§14 hướng dẫn Architect: ưu tiên gộp thay vì bịa
   * thêm biến thể mã lỗi không cần thiết — khác Supplier Payment's 2-mã split). */
  private normalizeIdempotencyKey(raw: string | undefined): string {
    const trimmed = raw?.trim();
    if (!trimmed || trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new BadRequestException(
        withCode(
          ErrorCode.SALES_RETURN_REFUND_IDEMPOTENCY_KEY_MISSING,
          `Thiếu header Idempotency-Key hoặc vượt quá ${IDEMPOTENCY_KEY_MAX_LENGTH} ký tự`,
        ),
      );
    }
    return trimmed;
  }
}
