import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../../../common/types/jwt-payload.type';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  ApiCommonErrors,
  ApiWriteErrors,
} from '../../../common/swagger/api-common-errors.decorator';
import { JwtAuthGuard } from '../../auth/presentation/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/presentation/permissions.guard';
import { RequirePermissions } from '../../rbac/presentation/permissions.decorator';
import {
  ActorContext,
  SupplierDebtService,
} from '../application/supplier-debt.service';
import { CreateSupplierPaymentDto } from '../application/dto/create-supplier-payment.dto';
import { SupplierPaymentResponseDto } from '../application/dto/supplier-payment-response.dto';

/** Độ dài tối đa Idempotency-Key (sau khi trim) — quyết định RIÊNG của Supplier Payment
 * (T052.05B D2), KHÔNG kế thừa từ Checkout (Checkout không giới hạn độ dài — T052.05A.1 §6). */
const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/** Permission tái dùng nguyên trạng từ catalog Foundation (Prompt 015) — không thêm permission mới. */
@ApiTags('SupplierPayment')
@ApiBearerAuth()
@ApiCommonErrors()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supplier-payment')
export class SupplierPaymentController {
  constructor(private readonly supplierDebtService: SupplierDebtService) {}

  @Post()
  @RequirePermissions('payment:create')
  @ApiOperation({
    summary:
      'Ghi nhận thanh toán cho nhà cung cấp — giảm công nợ (chặn nếu vượt quá công nợ hiện tại). Bắt buộc header Idempotency-Key (T052.05B).',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Do client tự sinh — cùng key + cùng payload sẽ trả lại đúng payment cũ, không tạo giao dịch mới. Sau khi trim: không rỗng, tối đa 255 ký tự. Không yêu cầu định dạng UUID (T052.05B D2).',
  })
  @ApiResponse({ status: 201, type: SupplierPaymentResponseDto })
  @ApiWriteErrors()
  async create(
    @Body() dto: CreateSupplierPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ): Promise<SupplierPaymentResponseDto> {
    const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);
    return this.supplierDebtService.createPayment(
      dto,
      this.toActor(user, req),
      normalizedKey,
    );
  }

  /** T052.05B D2 — quyết định RIÊNG của Supplier Payment (không kế thừa Checkout, vốn chỉ
   * chặn falsy, chấp nhận whitespace-only và không giới hạn độ dài — T052.05A.1 §6). */
  private normalizeIdempotencyKey(raw: string | undefined): string {
    const trimmed = raw?.trim();
    if (!trimmed) {
      throw new BadRequestException(
        withCode(
          ErrorCode.SUPPLIER_PAYMENT_IDEMPOTENCY_KEY_MISSING,
          'Thiếu header Idempotency-Key',
        ),
      );
    }
    if (trimmed.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new BadRequestException(
        withCode(
          ErrorCode.SUPPLIER_PAYMENT_IDEMPOTENCY_KEY_INVALID,
          `Idempotency-Key vượt quá ${IDEMPOTENCY_KEY_MAX_LENGTH} ký tự`,
        ),
      );
    }
    return trimmed;
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
