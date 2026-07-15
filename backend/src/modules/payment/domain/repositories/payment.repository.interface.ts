import { Prisma } from '@prisma/client';
import { PaymentEntity, PaymentMethod } from '../entities/payment.entity';

export interface CreatePaymentInput {
  organizationId: string;
  branchId: string;
  invoiceId: string;
  customerId?: string | null;
  method: PaymentMethod;
  amount: number;
  paidAt: Date;
  createdBy: string;
}

/**
 * "Single payment" (Prompt 035) — module này chỉ GHI THÊM (direction IN, luôn gắn 1
 * invoiceId), không có update/delete. Việc tạo Payment luôn nằm trong transaction của
 * Checkout Engine (`tx` truyền vào) — không có API public để tạo Payment độc lập ngoài
 * luồng Checkout (tránh tiền vào ngoài 1 transaction đã được kiểm soát).
 */
export interface IPaymentRepository {
  create(
    input: CreatePaymentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentEntity>;
  findById(id: string, organizationId: string): Promise<PaymentEntity | null>;
  findByInvoiceId(
    invoiceId: string,
    organizationId: string,
  ): Promise<PaymentEntity[]>;
}

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
