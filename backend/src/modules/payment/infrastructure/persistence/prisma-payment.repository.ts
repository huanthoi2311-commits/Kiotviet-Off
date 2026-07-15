import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PaymentEntity } from '../../domain/entities/payment.entity';
import {
  CreatePaymentInput,
  IPaymentRepository,
} from '../../domain/repositories/payment.repository.interface';

type RawPayment = Prisma.PaymentGetPayload<Record<string, never>>;

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreatePaymentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PaymentEntity> {
    const client = tx ?? this.prisma;
    const payment = await client.payment.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        invoiceId: input.invoiceId,
        customerId: input.customerId ?? null,
        method: input.method,
        direction: 'IN',
        amount: input.amount,
        paidAt: input.paidAt,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return this.toEntity(payment);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<PaymentEntity | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId, direction: 'IN', invoiceId: { not: null } },
    });
    return payment ? this.toEntity(payment) : null;
  }

  async findByInvoiceId(
    invoiceId: string,
    organizationId: string,
  ): Promise<PaymentEntity[]> {
    const payments = await this.prisma.payment.findMany({
      where: { invoiceId, organizationId, direction: 'IN' },
      orderBy: { paidAt: 'desc' },
    });
    return payments.map((p) => this.toEntity(p));
  }

  private toEntity(payment: RawPayment): PaymentEntity {
    return {
      id: payment.id,
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      invoiceId: payment.invoiceId as string,
      customerId: payment.customerId,
      method: payment.method,
      amount: payment.amount.toString(),
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    };
  }
}
