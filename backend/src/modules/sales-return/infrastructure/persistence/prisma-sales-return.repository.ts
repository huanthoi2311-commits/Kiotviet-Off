import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  SalesReturnEntity,
  SalesReturnRefundEntity,
  SalesReturnStatus,
} from '../../domain/entities/sales-return.entity';
import {
  SalesReturnConcurrencyRetryError,
  SalesReturnInvalidTransitionError,
  SalesReturnNotFoundError,
  SalesReturnQtyExceededError,
  SalesReturnRefundInvalidTransitionError,
  SalesReturnRefundNotFoundError,
  SalesReturnRefundVersionConflictError,
  SalesReturnVersionConflictError,
} from '../../domain/errors/sales-return.errors';
import {
  CreateSalesReturnInput,
  CreateSalesReturnRefundInput,
  ISalesReturnRepository,
  SalesReturnSearchParams,
  SalesReturnSearchResult,
  UpdateSalesReturnDraftInput,
} from '../../domain/repositories/sales-return.repository.interface';

const SALES_RETURN_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  refunds: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.SalesReturnInclude;

type SalesReturnWithRelations = Prisma.SalesReturnGetPayload<{
  include: typeof SALES_RETURN_INCLUDE;
}>;

type RawSalesReturnRefund = Prisma.SalesReturnRefundGetPayload<object>;

/**
 * Cửa ngõ ghi DUY NHẤT cho SalesReturn/SalesReturnItem/SalesReturnRefund (SPEC-T014 §9,
 * Decision AD42). Phase 2 — KHÔNG import/gọi `InventoryDomainService` dưới bất kỳ hình thức nào
 * (Decision AD46) — Phase 3 (Application Service) chịu trách nhiệm phục hồi tồn kho trong CÙNG
 * `tx` mà `receive()` dưới đây nhận từ caller.
 */
@Injectable()
export class PrismaSalesReturnRepository implements ISalesReturnRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateSalesReturnInput): Promise<SalesReturnEntity> {
    const created = await this.prisma.salesReturn.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        invoiceId: input.invoiceId,
        customerId: input.customerId,
        code: input.code,
        note: input.note,
        totalAmount: input.items.reduce(
          (sum, item) => sum + item.totalAmount,
          0,
        ),
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        items: {
          create: input.items.map((item) => ({
            invoiceItemId: item.invoiceItemId,
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
            productCodeSnapshot: item.productCodeSnapshot,
            productNameSnapshot: item.productNameSnapshot,
            unitNameSnapshot: item.unitNameSnapshot,
            reason: item.reason,
            reasonNote: item.reasonNote,
          })),
        },
      },
      include: SALES_RETURN_INCLUDE,
    });
    return this.toEntity(created);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<SalesReturnEntity | null> {
    const found = await this.prisma.salesReturn.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: SALES_RETURN_INCLUDE,
    });
    return found ? this.toEntity(found) : null;
  }

  async search(
    params: SalesReturnSearchParams,
  ): Promise<SalesReturnSearchResult> {
    const where: Prisma.SalesReturnWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      invoiceId: params.invoiceId,
      status: params.status,
      ...(params.search
        ? { code: { contains: params.search, mode: 'insensitive' } }
        : {}),
    };
    const skip = (params.page - 1) * params.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesReturn.findMany({
        where,
        include: SALES_RETURN_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.limit,
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async updateDraft(
    id: string,
    organizationId: string,
    version: number,
    input: UpdateSalesReturnDraftInput,
  ): Promise<SalesReturnEntity> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.salesReturn.findFirst({
        where: { id, organizationId },
      });
      if (!current) throw new SalesReturnNotFoundError(id);
      if (current.status !== 'DRAFT') {
        throw new SalesReturnInvalidTransitionError(current.status, 'DRAFT');
      }
      if (current.version !== version) {
        throw new SalesReturnVersionConflictError(id);
      }

      if (input.items) {
        await tx.salesReturnItem.deleteMany({ where: { salesReturnId: id } });
      }

      const result = await tx.salesReturn.updateMany({
        where: { id, organizationId, version },
        data: {
          note: input.note,
          updatedBy: input.updatedBy,
          version: { increment: 1 },
          ...(input.items
            ? {
                totalAmount: input.items.reduce(
                  (sum, item) => sum + item.totalAmount,
                  0,
                ),
                items: {
                  create: input.items.map((item) => ({
                    invoiceItemId: item.invoiceItemId,
                    productId: item.productId,
                    warehouseId: item.warehouseId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discount: item.discount,
                    taxAmount: item.taxAmount,
                    totalAmount: item.totalAmount,
                    productCodeSnapshot: item.productCodeSnapshot,
                    productNameSnapshot: item.productNameSnapshot,
                    unitNameSnapshot: item.unitNameSnapshot,
                    reason: item.reason,
                    reasonNote: item.reasonNote,
                  })),
                },
              }
            : {}),
        },
      });
      if (result.count === 0) throw new SalesReturnVersionConflictError(id);

      const updated = await tx.salesReturn.findFirstOrThrow({
        where: { id, organizationId },
        include: SALES_RETURN_INCLUDE,
      });
      return this.toEntity(updated);
    });
  }

  submit(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      version,
      'DRAFT',
      'SUBMITTED',
      updatedBy,
    );
  }

  approve(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      version,
      'SUBMITTED',
      'APPROVED',
      updatedBy,
    );
  }

  /**
   * APPROVED → RECEIVED (Decision AD44, SPEC §13). Nhận `tx` từ caller (Application Service,
   * Phase 3) — KHÔNG tự mở/commit transaction, KHÔNG gọi InventoryDomainService (Decision AD46).
   */
  async receive(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity> {
    const current = await tx.salesReturn.findFirst({
      where: { id, organizationId },
      include: SALES_RETURN_INCLUDE,
    });
    if (!current) throw new SalesReturnNotFoundError(id);
    if (current.status !== 'APPROVED') {
      throw new SalesReturnInvalidTransitionError(current.status, 'RECEIVED');
    }
    if (current.version !== version) {
      throw new SalesReturnVersionConflictError(id);
    }

    const invoiceItemIds = [
      ...new Set(current.items.map((item) => item.invoiceItemId)),
    ].sort();

    // Bước 1 — Khóa InvoiceItem liên quan, thứ tự cố định (Decision AD44, SPEC §13.2 step 1-2).
    // Raw SQL vì Prisma Client fluent API không có phương thức khóa row trực tiếp.
    try {
      await tx.$queryRaw`
        SELECT id FROM invoice_items
        WHERE id = ANY(${invoiceItemIds}::uuid[])
        ORDER BY id
        FOR UPDATE
      `;
    } catch {
      throw new SalesReturnConcurrencyRetryError(invoiceItemIds);
    }

    // Bước 2 — Tính lại Eligible Quantity TỪ DỮ LIỆU ĐÃ COMMIT, SAU khi có lock (SPEC §13.2 step 3-4).
    for (const invoiceItemId of invoiceItemIds) {
      const invoiceItem = await tx.invoiceItem.findUniqueOrThrow({
        where: { id: invoiceItemId },
      });
      const counted = await tx.salesReturnItem.aggregate({
        _sum: { quantity: true },
        where: {
          invoiceItemId,
          salesReturn: { status: { in: ['RECEIVED', 'COMPLETED'] } },
        },
      });
      const eligibleQty = invoiceItem.quantity.minus(
        counted._sum.quantity ?? new Prisma.Decimal(0),
      );
      const requestedQty = current.items
        .filter((item) => item.invoiceItemId === invoiceItemId)
        .reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0));

      if (requestedQty.greaterThan(eligibleQty)) {
        throw new SalesReturnQtyExceededError(
          invoiceItemId,
          eligibleQty.toString(),
        );
      }
    }

    // Bước 3 — Chuyển trạng thái RECEIVED (SPEC §13.2 step 5). Phục hồi tồn kho (step 6-7) do
    // Application Service thực hiện SAU khi phương thức này resolve, trong CÙNG `tx`.
    const result = await tx.salesReturn.updateMany({
      where: { id, organizationId, version },
      data: { status: 'RECEIVED', updatedBy, version: { increment: 1 } },
    });
    if (result.count === 0) throw new SalesReturnVersionConflictError(id);

    const updated = await tx.salesReturn.findFirstOrThrow({
      where: { id, organizationId },
      include: SALES_RETURN_INCLUDE,
    });
    return this.toEntity(updated);
  }

  complete(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity> {
    return this.transitionSimple(
      id,
      organizationId,
      version,
      'RECEIVED',
      'COMPLETED',
      updatedBy,
    );
  }

  async cancel(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.salesReturn.findFirst({
        where: { id, organizationId },
      });
      if (!current) throw new SalesReturnNotFoundError(id);
      if (
        !(['DRAFT', 'SUBMITTED', 'APPROVED'] as SalesReturnStatus[]).includes(
          current.status,
        )
      ) {
        throw new SalesReturnInvalidTransitionError(
          current.status,
          'CANCELLED',
        );
      }
      if (current.version !== version) {
        throw new SalesReturnVersionConflictError(id);
      }

      const result = await tx.salesReturn.updateMany({
        where: { id, organizationId, version },
        data: { status: 'CANCELLED', updatedBy, version: { increment: 1 } },
      });
      if (result.count === 0) throw new SalesReturnVersionConflictError(id);

      const updated = await tx.salesReturn.findFirstOrThrow({
        where: { id, organizationId },
        include: SALES_RETURN_INCLUDE,
      });
      return this.toEntity(updated);
    });
  }

  // --- Refund (transaction riêng, độc lập với SalesReturn — SPEC §14/§15, Decision AD37) ---

  async createRefund(
    input: CreateSalesReturnRefundInput,
  ): Promise<SalesReturnRefundEntity> {
    const created = await this.prisma.salesReturnRefund.create({
      data: {
        salesReturnId: input.salesReturnId,
        amount: input.amount,
        method: input.method,
        externalReference: input.externalReference,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
    return this.toRefundEntity(created);
  }

  async findRefundById(
    id: string,
    organizationId: string,
  ): Promise<SalesReturnRefundEntity | null> {
    const found = await this.prisma.salesReturnRefund.findFirst({
      where: { id, salesReturn: { organizationId } },
    });
    return found ? this.toRefundEntity(found) : null;
  }

  processRefund(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity> {
    return this.transitionRefund(
      id,
      organizationId,
      version,
      'PENDING',
      'PROCESSING',
      updatedBy,
    );
  }

  completeRefund(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity> {
    return this.transitionRefund(
      id,
      organizationId,
      version,
      'PROCESSING',
      'COMPLETED',
      updatedBy,
    );
  }

  async failRefund(
    id: string,
    organizationId: string,
    version: number,
    failureReason: string,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity> {
    const current = await this.prisma.salesReturnRefund.findFirst({
      where: { id, salesReturn: { organizationId } },
    });
    if (!current) throw new SalesReturnRefundNotFoundError(id);
    if (current.status !== 'PROCESSING') {
      throw new SalesReturnRefundInvalidTransitionError(
        current.status,
        'FAILED',
      );
    }
    if (current.version !== version) {
      throw new SalesReturnRefundVersionConflictError(id);
    }

    const result = await this.prisma.salesReturnRefund.updateMany({
      where: { id, version },
      data: {
        status: 'FAILED',
        failureReason,
        updatedBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new SalesReturnRefundVersionConflictError(id);

    const updated = await this.prisma.salesReturnRefund.findUniqueOrThrow({
      where: { id },
    });
    return this.toRefundEntity(updated);
  }

  cancelRefund(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity> {
    return this.transitionRefund(
      id,
      organizationId,
      version,
      'PENDING',
      'CANCELLED',
      updatedBy,
    );
  }

  // --- Helpers ---

  private async transitionSimple(
    id: string,
    organizationId: string,
    version: number,
    expectedStatus: SalesReturnStatus,
    nextStatus: SalesReturnStatus,
    updatedBy: string,
  ): Promise<SalesReturnEntity> {
    const current = await this.prisma.salesReturn.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new SalesReturnNotFoundError(id);
    if (current.status !== expectedStatus) {
      throw new SalesReturnInvalidTransitionError(current.status, nextStatus);
    }
    if (current.version !== version) {
      throw new SalesReturnVersionConflictError(id);
    }

    const result = await this.prisma.salesReturn.updateMany({
      where: { id, organizationId, version },
      data: { status: nextStatus, updatedBy, version: { increment: 1 } },
    });
    if (result.count === 0) throw new SalesReturnVersionConflictError(id);

    const updated = await this.prisma.salesReturn.findFirstOrThrow({
      where: { id, organizationId },
      include: SALES_RETURN_INCLUDE,
    });
    return this.toEntity(updated);
  }

  private async transitionRefund(
    id: string,
    organizationId: string,
    version: number,
    expectedStatus: string,
    nextStatus: string,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity> {
    const current = await this.prisma.salesReturnRefund.findFirst({
      where: { id, salesReturn: { organizationId } },
    });
    if (!current) throw new SalesReturnRefundNotFoundError(id);
    if (current.status !== expectedStatus) {
      throw new SalesReturnRefundInvalidTransitionError(
        current.status,
        nextStatus,
      );
    }
    if (current.version !== version) {
      throw new SalesReturnRefundVersionConflictError(id);
    }

    const result = await this.prisma.salesReturnRefund.updateMany({
      where: { id, version },
      data: {
        status: nextStatus as Prisma.SalesReturnRefundUpdateInput['status'],
        updatedBy,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new SalesReturnRefundVersionConflictError(id);

    const updated = await this.prisma.salesReturnRefund.findUniqueOrThrow({
      where: { id },
    });
    return this.toRefundEntity(updated);
  }

  private toEntity(salesReturn: SalesReturnWithRelations): SalesReturnEntity {
    return {
      id: salesReturn.id,
      organizationId: salesReturn.organizationId,
      branchId: salesReturn.branchId,
      invoiceId: salesReturn.invoiceId,
      customerId: salesReturn.customerId,
      code: salesReturn.code,
      status: salesReturn.status,
      totalAmount: salesReturn.totalAmount.toString(),
      note: salesReturn.note,
      createdBy: salesReturn.createdBy,
      updatedBy: salesReturn.updatedBy,
      createdAt: salesReturn.createdAt,
      updatedAt: salesReturn.updatedAt,
      version: salesReturn.version,
      items: salesReturn.items.map((item) => ({
        id: item.id,
        invoiceItemId: item.invoiceItemId,
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        discount: item.discount.toString(),
        taxAmount: item.taxAmount.toString(),
        totalAmount: item.totalAmount.toString(),
        productCodeSnapshot: item.productCodeSnapshot,
        productNameSnapshot: item.productNameSnapshot,
        unitNameSnapshot: item.unitNameSnapshot,
        reason: item.reason,
        reasonNote: item.reasonNote,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      refunds: salesReturn.refunds.map((refund) => this.toRefundEntity(refund)),
    };
  }

  private toRefundEntity(
    refund: RawSalesReturnRefund,
  ): SalesReturnRefundEntity {
    return {
      id: refund.id,
      salesReturnId: refund.salesReturnId,
      amount: refund.amount.toString(),
      method: refund.method,
      status: refund.status,
      externalReference: refund.externalReference,
      failureReason: refund.failureReason,
      createdBy: refund.createdBy,
      updatedBy: refund.updatedBy,
      createdAt: refund.createdAt,
      updatedAt: refund.updatedAt,
      version: refund.version,
    };
  }
}
