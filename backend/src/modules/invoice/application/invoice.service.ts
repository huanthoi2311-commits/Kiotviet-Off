import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import {
  CreateInvoiceItemInput,
  INVOICE_REPOSITORY,
} from '../domain/repositories/invoice.repository.interface';
import type { IInvoiceRepository } from '../domain/repositories/invoice.repository.interface';
import { InvoiceStatus } from '../domain/entities/invoice.entity';
import { INVOICE_CODE_GENERATOR } from '../domain/services/invoice-code-generator.interface';
import type { IInvoiceCodeGenerator } from '../domain/services/invoice-code-generator.interface';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import {
  InvoiceResponseDto,
  PaginatedInvoiceResponseDto,
} from './dto/invoice-response.dto';
import { InvoiceMapper } from './mappers/invoice.mapper';

export interface CreateInvoiceParams {
  organizationId: string;
  branchId: string;
  customerId?: string | null;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  status: InvoiceStatus;
  items: CreateInvoiceItemInput[];
  createdBy: string;
  /** Mandatory Snapshot (SPEC-T013-SALES-FOUNDATION-001 §1.3) — null nếu không có Customer. */
  customerCodeSnapshot?: string | null;
  customerNameSnapshot?: string | null;
  customerPhoneSnapshot?: string | null;
}

/**
 * Không có endpoint public để tạo Invoice (Prompt 035) — createInvoice() chỉ được gọi bởi
 * Checkout Engine, luôn kèm `tx` để nằm trong CÙNG transaction với Inventory/Point/Payment
 * ("Toàn bộ → Một Transaction"). API public chỉ có 2 route xem (GET), xem mục Controller.
 */
@Injectable()
export class InvoiceService {
  constructor(
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepository: IInvoiceRepository,
    @Inject(INVOICE_CODE_GENERATOR)
    private readonly invoiceCodeGenerator: IInvoiceCodeGenerator,
  ) {}

  async createInvoice(
    params: CreateInvoiceParams,
    tx?: Prisma.TransactionClient,
  ): Promise<InvoiceResponseDto> {
    const code = await this.invoiceCodeGenerator.generate(
      params.organizationId,
      params.branchId,
    );
    const created = await this.invoiceRepository.create(
      {
        organizationId: params.organizationId,
        branchId: params.branchId,
        customerId: params.customerId ?? null,
        code,
        status: params.status,
        totalAmount: params.totalAmount,
        paidAmount: params.paidAmount,
        dueAmount: params.dueAmount,
        items: params.items,
        createdBy: params.createdBy,
        customerCodeSnapshot: params.customerCodeSnapshot ?? null,
        customerNameSnapshot: params.customerNameSnapshot ?? null,
        customerPhoneSnapshot: params.customerPhoneSnapshot ?? null,
      },
      tx,
    );
    return InvoiceMapper.toResponseDto(created);
  }

  async getById(
    id: string,
    organizationId: string,
  ): Promise<InvoiceResponseDto> {
    const invoice = await this.invoiceRepository.findById(id, organizationId);
    if (!invoice) {
      throw new NotFoundException(
        withCode(ErrorCode.INVOICE_NOT_FOUND, 'Không tìm thấy hóa đơn'),
      );
    }
    return InvoiceMapper.toResponseDto(invoice);
  }

  async search(
    query: InvoiceQueryDto,
    organizationId: string,
  ): Promise<PaginatedInvoiceResponseDto> {
    const result = await this.invoiceRepository.search({
      organizationId,
      customerId: query.customerId,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    return {
      items: result.items.map((item) => InvoiceMapper.toResponseDto(item)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}
