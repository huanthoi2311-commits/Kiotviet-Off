import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  InvoiceEntity,
  InvoiceItemEntity,
} from '../../domain/entities/invoice.entity';
import {
  CreateInvoiceInput,
  IInvoiceRepository,
  InvoiceSearchParams,
  InvoiceSearchResult,
} from '../../domain/repositories/invoice.repository.interface';

type RawInvoice = Prisma.InvoiceGetPayload<{ include: { items: true } }>;

@Injectable()
export class PrismaInvoiceRepository implements IInvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateInvoiceInput,
    tx?: Prisma.TransactionClient,
  ): Promise<InvoiceEntity> {
    const client = tx ?? this.prisma;
    const invoice = await client.invoice.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        customerId: input.customerId ?? null,
        code: input.code,
        status: input.status,
        totalAmount: input.totalAmount,
        paidAmount: input.paidAmount,
        dueAmount: input.dueAmount,
        createdBy: input.createdBy,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount ?? 0,
            taxAmount: item.taxAmount ?? 0,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: { items: true },
    });
    return this.toEntity(invoice);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<InvoiceEntity | null> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    return invoice ? this.toEntity(invoice) : null;
  }

  async search(params: InvoiceSearchParams): Promise<InvoiceSearchResult> {
    const where: Prisma.InvoiceWhereInput = {
      organizationId: params.organizationId,
      customerId: params.customerId,
      status: params.status,
    };
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  private toEntity(invoice: RawInvoice): InvoiceEntity {
    return {
      id: invoice.id,
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      orderId: invoice.orderId,
      customerId: invoice.customerId,
      code: invoice.code,
      status: invoice.status,
      totalAmount: invoice.totalAmount.toString(),
      paidAmount: invoice.paidAmount.toString(),
      dueAmount: invoice.dueAmount.toString(),
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      items: invoice.items.map((item) => this.toItemEntity(item)),
    };
  }

  private toItemEntity(item: RawInvoice['items'][number]): InvoiceItemEntity {
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      discount: item.discount.toString(),
      taxAmount: item.taxAmount.toString(),
      totalAmount: item.totalAmount.toString(),
    };
  }
}
