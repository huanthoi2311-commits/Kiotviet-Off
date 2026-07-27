import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  SalesReturnInvoiceItemNotFoundError,
  SalesReturnQtyExceededError,
} from '../domain/errors/sales-return.errors';

export interface EligibleQuantityResult {
  invoiceItemId: string;
  soldQty: string;
  returnedQty: string;
  eligibleQty: string;
}

/**
 * SPEC-T014-SALES-RETURN-EXCHANGE-001 §5, §32 (RFC "GetInvoiceReturnEligibility" query) —
 * tính Eligible Quantity CHỈ mang tính TƯ VẤN (advisory), dùng cho Create/UpdateDraft/Submit/
 * Approve và query hiển thị UI. KHÔNG khóa row, KHÔNG phải nguồn sự thật cuối cùng — nguồn sự
 * thật DUY NHẤT là `ISalesReturnRepository.receive()` (Decision AD44, chạy dưới serialization
 * boundary thật sự trong transaction do Application Service sở hữu, xem `SalesReturnService`).
 */
@Injectable()
export class ReturnEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getEligibleQuantity(
    invoiceItemId: string,
    organizationId: string,
  ): Promise<EligibleQuantityResult> {
    const invoiceItem = await this.prisma.invoiceItem.findFirst({
      where: { id: invoiceItemId, invoice: { organizationId } },
    });
    if (!invoiceItem) {
      throw new SalesReturnInvoiceItemNotFoundError(invoiceItemId);
    }

    const counted = await this.prisma.salesReturnItem.aggregate({
      _sum: { quantity: true },
      where: {
        invoiceItemId,
        salesReturn: { status: { in: ['RECEIVED', 'COMPLETED'] } },
      },
    });
    const returnedQty = counted._sum.quantity ?? new Prisma.Decimal(0);
    const eligibleQty = invoiceItem.quantity.minus(returnedQty);

    return {
      invoiceItemId,
      soldQty: invoiceItem.quantity.toString(),
      returnedQty: returnedQty.toString(),
      eligibleQty: eligibleQty.toString(),
    };
  }

  /** Ném SalesReturnQtyExceededError nếu BẤT KỲ dòng nào vượt Eligible Quantity (advisory). */
  async validateRequestedQuantities(
    items: { invoiceItemId: string; quantity: number }[],
    organizationId: string,
  ): Promise<void> {
    const requestedByInvoiceItem = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      const current =
        requestedByInvoiceItem.get(item.invoiceItemId) ?? new Prisma.Decimal(0);
      requestedByInvoiceItem.set(
        item.invoiceItemId,
        current.plus(item.quantity),
      );
    }

    for (const [invoiceItemId, requestedQty] of requestedByInvoiceItem) {
      const { eligibleQty } = await this.getEligibleQuantity(
        invoiceItemId,
        organizationId,
      );
      if (requestedQty.greaterThan(eligibleQty)) {
        throw new SalesReturnQtyExceededError(invoiceItemId, eligibleQty);
      }
    }
  }
}
