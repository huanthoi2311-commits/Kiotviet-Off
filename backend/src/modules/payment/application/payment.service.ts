import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  CreatePaymentInput,
  PAYMENT_REPOSITORY,
} from '../domain/repositories/payment.repository.interface';
import type { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentMapper } from './mappers/payment.mapper';

/**
 * Không có endpoint public để tạo Payment (Prompt 035) — createPayment() chỉ được gọi bởi
 * Checkout Engine, luôn kèm `tx` để nằm trong CÙNG transaction với Inventory/Point/Invoice
 * ("Toàn bộ → Một Transaction"). API public chỉ có 2 route xem (GET), xem mục Controller.
 */
@Injectable()
export class PaymentService {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async createPayment(
    input: CreatePaymentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentResponseDto> {
    const created = await this.paymentRepository.create(input, tx);
    return PaymentMapper.toResponseDto(created);
  }

  async getById(
    id: string,
    organizationId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findById(id, organizationId);
    if (!payment) {
      throw new NotFoundException(
        withCode(ErrorCode.PAYMENT_NOT_FOUND, 'Không tìm thấy thanh toán'),
      );
    }
    return PaymentMapper.toResponseDto(payment);
  }

  async getByInvoiceId(
    invoiceId: string,
    organizationId: string,
  ): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepository.findByInvoiceId(
      invoiceId,
      organizationId,
    );
    return payments.map((p) => PaymentMapper.toResponseDto(p));
  }
}
