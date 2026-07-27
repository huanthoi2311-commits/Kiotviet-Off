import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-codes';
import { withCode } from '../../../common/errors/with-code';
import { AuditLogService } from '../../platform/audit-log/audit-log.service';
import { DomainEventPublisher } from '../../platform/events/domain-event-publisher.service';
import { InvoiceService } from '../../invoice/application/invoice.service';
import { InvoiceItemResponseDto } from '../../invoice/application/dto/invoice-response.dto';
import { ProductDomainService } from '../../product/application/product-domain.service';
import { InventoryDomainService } from '../../inventory/application/inventory-domain.service';
import {
  SalesReturnEntity,
  SalesReturnReason,
} from '../domain/entities/sales-return.entity';
import {
  SalesReturnConcurrencyRetryError,
  SalesReturnInvalidTransitionError,
  SalesReturnInvoiceItemNotFoundError,
  SalesReturnNotFoundError,
  SalesReturnQtyExceededError,
  SalesReturnVersionConflictError,
} from '../domain/errors/sales-return.errors';
import {
  INVENTORY_RESTORED_EVENT,
  SALES_RETURN_APPROVED_EVENT,
  SALES_RETURN_CANCELLED_EVENT,
  SALES_RETURN_COMPLETED_EVENT,
  SALES_RETURN_CREATED_EVENT,
  SALES_RETURN_RECEIVED_EVENT,
  SALES_RETURN_SUBMITTED_EVENT,
} from '../domain/events/sales-return.events';
import {
  CreateSalesReturnItemInput,
  SALES_RETURN_REPOSITORY,
  SalesReturnSearchParams,
  SalesReturnSearchResult,
  UpdateSalesReturnDraftInput,
} from '../domain/repositories/sales-return.repository.interface';
import type { ISalesReturnRepository } from '../domain/repositories/sales-return.repository.interface';
import { SALES_RETURN_CODE_GENERATOR } from '../domain/services/sales-return-code-generator.interface';
import type { ISalesReturnCodeGenerator } from '../domain/services/sales-return-code-generator.interface';
import {
  EligibleQuantityResult,
  ReturnEligibilityService,
} from './return-eligibility.service';

export interface ActorContext {
  userId: string;
  organizationId: string;
}

export interface CreateSalesReturnItemParams {
  invoiceItemId: string;
  quantity: number;
  reason: SalesReturnReason;
  reasonNote?: string | null;
  warehouseId?: string | null;
}

export interface CreateSalesReturnParams {
  invoiceId: string;
  note?: string | null;
  items: CreateSalesReturnItemParams[];
}

/** Trạng thái Invoice KHÔNG đủ điều kiện trả hàng (SPEC §0.1 OQ1). */
const INVOICE_INELIGIBLE_STATUSES = ['CANCELLED'];

/**
 * Application Service điều phối toàn bộ Return state machine (SPEC-T014 §Implementation Order
 * bước 5, RFC-T014 v1.1 §19/§24). Sở hữu `prisma.$transaction()` cho bước `receive()` (Decision
 * AD46) — repository chỉ tham gia transaction do Service cung cấp, không tự mở/commit, không
 * gọi InventoryDomainService.
 */
@Injectable()
export class SalesReturnService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SALES_RETURN_REPOSITORY)
    private readonly salesReturnRepository: ISalesReturnRepository,
    @Inject(SALES_RETURN_CODE_GENERATOR)
    private readonly codeGenerator: ISalesReturnCodeGenerator,
    private readonly eligibilityService: ReturnEligibilityService,
    private readonly invoiceService: InvoiceService,
    private readonly productDomainService: ProductDomainService,
    private readonly inventoryDomainService: InventoryDomainService,
    private readonly auditLogService: AuditLogService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  /** Read-only passthrough — không phải Domain logic, chỉ hoàn thiện API surface cho Phase 5. */
  async findOne(
    id: string,
    organizationId: string,
  ): Promise<SalesReturnEntity> {
    const found = await this.salesReturnRepository.findById(id, organizationId);
    if (!found) throw this.mapError(new SalesReturnNotFoundError(id));
    return found;
  }

  /** Read-only passthrough — không phải Domain logic, chỉ hoàn thiện API surface cho Phase 5. */
  search(params: SalesReturnSearchParams): Promise<SalesReturnSearchResult> {
    return this.salesReturnRepository.search(params);
  }

  /**
   * GetInvoiceReturnEligibility (SPEC §4/§16, RFC "advisory eligibility" query) — SPEC ghi route
   * là `?invoiceId=` nhưng `ReturnEligibilityService.getEligibleQuantity()` chỉ nhận
   * `invoiceItemId` (không có API invoiceId-scoped sẵn có). Compose 2 phần đã có: đọc Invoice qua
   * `InvoiceService.getById()` rồi tính eligibility cho từng dòng — không thêm business rule mới,
   * chỉ hoàn thiện route đã ghi trong SPEC.
   */
  async getInvoiceEligibility(
    invoiceId: string,
    organizationId: string,
  ): Promise<EligibleQuantityResult[]> {
    const invoice = await this.invoiceService.getById(
      invoiceId,
      organizationId,
    );
    return Promise.all(
      invoice.items.map((item) =>
        this.eligibilityService.getEligibleQuantity(item.id, organizationId),
      ),
    );
  }

  async create(
    params: CreateSalesReturnParams,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    const invoice = await this.invoiceService.getById(
      params.invoiceId,
      actor.organizationId,
    );
    if (INVOICE_INELIGIBLE_STATUSES.includes(invoice.status)) {
      throw new UnprocessableEntityException(
        withCode(
          ErrorCode.SALES_RETURN_INVOICE_NOT_ELIGIBLE,
          'Hóa đơn không đủ điều kiện để trả hàng',
        ),
      );
    }

    const items = this.buildItemInputs(invoice, params.items);

    try {
      await this.eligibilityService.validateRequestedQuantities(
        items.map((item) => ({
          invoiceItemId: item.invoiceItemId,
          quantity: item.quantity,
        })),
        actor.organizationId,
      );
    } catch (error) {
      throw this.mapError(error);
    }

    const code = await this.codeGenerator.generate(actor.organizationId);

    try {
      const created = await this.salesReturnRepository.create({
        organizationId: actor.organizationId,
        branchId: invoice.branchId,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        code,
        note: params.note ?? null,
        items,
        createdBy: actor.userId,
      });

      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.create',
        entityType: 'SalesReturn',
        entityId: created.id,
        newValue: this.toAuditSnapshot(created),
      });
      this.eventPublisher.publish(
        SALES_RETURN_CREATED_EVENT,
        this.toLifecycleEvent(created, actor),
      );

      return created;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async updateDraft(
    id: string,
    expectedVersion: number,
    params: { note?: string | null; items?: CreateSalesReturnItemParams[] },
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    const input: UpdateSalesReturnDraftInput = { updatedBy: actor.userId };
    if (params.note !== undefined) input.note = params.note;

    if (params.items) {
      const current = await this.salesReturnRepository.findById(
        id,
        actor.organizationId,
      );
      if (!current) throw this.mapError(new SalesReturnNotFoundError(id));
      const invoice = await this.invoiceService.getById(
        current.invoiceId,
        actor.organizationId,
      );
      input.items = this.buildItemInputs(invoice, params.items);
      try {
        await this.eligibilityService.validateRequestedQuantities(
          input.items.map((item) => ({
            invoiceItemId: item.invoiceItemId,
            quantity: item.quantity,
          })),
          actor.organizationId,
        );
      } catch (error) {
        throw this.mapError(error);
      }
    }

    try {
      const updated = await this.salesReturnRepository.updateDraft(
        id,
        actor.organizationId,
        expectedVersion,
        input,
      );
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.update_draft',
        entityType: 'SalesReturn',
        entityId: id,
        newValue: this.toAuditSnapshot(updated),
      });
      return updated;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async submit(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    return this.simpleTransition(
      (v) =>
        this.salesReturnRepository.submit(
          id,
          actor.organizationId,
          v,
          actor.userId,
        ),
      id,
      expectedVersion,
      'sales_return.submit',
      SALES_RETURN_SUBMITTED_EVENT,
      actor,
    );
  }

  async approve(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    return this.simpleTransition(
      (v) =>
        this.salesReturnRepository.approve(
          id,
          actor.organizationId,
          v,
          actor.userId,
        ),
      id,
      expectedVersion,
      'sales_return.approve',
      SALES_RETURN_APPROVED_EVENT,
      actor,
    );
  }

  /**
   * APPROVED → RECEIVED. Service sở hữu transaction (Decision AD46): gọi
   * `ISalesReturnRepository.receive(tx, ...)` (khóa InvoiceItem + validate Eligible Quantity +
   * chuyển trạng thái, Decision AD44), sau đó với từng dòng KHÔNG phải SERVICE (Decision AD45),
   * gọi `InventoryDomainService.increase(tx, ...)` trong CÙNG transaction. Events + Audit CHỈ
   * chạy SAU khi transaction commit thành công.
   */
  async receive(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const salesReturn = await this.salesReturnRepository.receive(
          tx,
          id,
          actor.organizationId,
          expectedVersion,
          actor.userId,
        );

        for (const item of salesReturn.items) {
          const product = await this.productDomainService.findById(
            item.productId,
            actor.organizationId,
          );
          if (!product) {
            throw new NotFoundException(
              withCode(ErrorCode.PRODUCT_NOT_FOUND, 'Không tìm thấy sản phẩm'),
            );
          }
          // SERVICE/non-stock — bỏ qua phục hồi tồn kho (Decision AD45, SPEC §12).
          if (product.type === 'SERVICE') continue;

          if (!item.warehouseId) {
            throw new UnprocessableEntityException(
              withCode(
                ErrorCode.SALES_RETURN_WAREHOUSE_REQUIRED,
                'Cần chọn kho nhận hàng cho dòng hàng có quản lý tồn kho',
              ),
            );
          }

          // Average-cost-aware (SPEC §12): dùng Product.costPrice làm cơ sở giá vốn — KHÔNG
          // dùng InvoiceItem.unitPrice (giá BÁN, dùng sẽ làm sai Average Cost của kho).
          // Disclosed deviation so với thiết kế SPEC ban đầu ("đọc avgCost hiện tại của
          // Warehouse qua InventoryDomainService") — InventoryDomainService không có phương
          // thức đọc (chỉ increase/decrease/adjust/transfer/recordMovement, xác nhận khi triển
          // khai Phase 3), nên dùng costPrice của Product (đã có sẵn, không cần mở rộng
          // InventoryDomainService/đụng module inventory).
          await this.inventoryDomainService.increase(tx, {
            organizationId: actor.organizationId,
            warehouseId: item.warehouseId,
            productId: item.productId,
            quantity: Number(item.quantity),
            unitCost: Number(product.costPrice),
            movementType: 'RETURN',
            referenceType: 'RETURN',
            referenceId: salesReturn.id,
            createdBy: actor.userId,
          });
        }

        return salesReturn;
      });

      this.eventPublisher.publish(
        SALES_RETURN_RECEIVED_EVENT,
        this.toLifecycleEvent(result, actor),
      );
      for (const item of result.items) {
        if (item.warehouseId) {
          this.eventPublisher.publish(INVENTORY_RESTORED_EVENT, {
            organizationId: actor.organizationId,
            userId: actor.userId,
            salesReturnId: result.id,
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: item.quantity,
            occurredAt: new Date(),
          });
        }
      }
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: 'sales_return.receive',
        entityType: 'SalesReturn',
        entityId: result.id,
        newValue: this.toAuditSnapshot(result),
      });

      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** RECEIVED → COMPLETED. Refund KHÔNG phải điều kiện tiên quyết (Decision AD43). */
  async complete(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    return this.simpleTransition(
      (v) =>
        this.salesReturnRepository.complete(
          id,
          actor.organizationId,
          v,
          actor.userId,
        ),
      id,
      expectedVersion,
      'sales_return.complete',
      SALES_RETURN_COMPLETED_EVENT,
      actor,
    );
  }

  async cancel(
    id: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    return this.simpleTransition(
      (v) =>
        this.salesReturnRepository.cancel(
          id,
          actor.organizationId,
          v,
          actor.userId,
        ),
      id,
      expectedVersion,
      'sales_return.cancel',
      SALES_RETURN_CANCELLED_EVENT,
      actor,
    );
  }

  private async simpleTransition(
    fn: (expectedVersion: number) => Promise<SalesReturnEntity>,
    id: string,
    expectedVersion: number,
    auditAction: string,
    eventName: string,
    actor: ActorContext,
  ): Promise<SalesReturnEntity> {
    try {
      const result = await fn(expectedVersion);
      await this.auditLogService.log({
        organizationId: actor.organizationId,
        userId: actor.userId,
        action: auditAction,
        entityType: 'SalesReturn',
        entityId: id,
        newValue: this.toAuditSnapshot(result),
      });
      this.eventPublisher.publish(
        eventName,
        this.toLifecycleEvent(result, actor),
      );
      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private buildItemInputs(
    invoice: { items: InvoiceItemResponseDto[] },
    items: CreateSalesReturnItemParams[],
  ): CreateSalesReturnItemInput[] {
    return items.map((item) => {
      const invoiceItem = invoice.items.find(
        (candidate) => candidate.id === item.invoiceItemId,
      );
      if (!invoiceItem) {
        throw new UnprocessableEntityException(
          withCode(
            ErrorCode.SALES_RETURN_INVOICE_ITEM_NOT_FOUND,
            `Dòng hàng ${item.invoiceItemId} không thuộc hóa đơn này`,
          ),
        );
      }
      const soldQty = Number(invoiceItem.quantity);
      const invoiceItemTotal = Number(invoiceItem.totalAmount);
      // SPEC §0.7 — lineReturnValue tỉ lệ tuyến tính trên totalAmount gốc của dòng.
      const lineReturnValue =
        soldQty === 0 ? 0 : (invoiceItemTotal / soldQty) * item.quantity;

      return {
        invoiceItemId: item.invoiceItemId,
        productId: invoiceItem.productId,
        warehouseId: item.warehouseId ?? null,
        quantity: item.quantity,
        unitPrice: Number(invoiceItem.unitPrice),
        discount: Number(invoiceItem.discount),
        taxAmount: Number(invoiceItem.taxAmount),
        totalAmount: lineReturnValue,
        productCodeSnapshot: (invoiceItem.productCodeSnapshot as string) ?? '',
        productNameSnapshot: (invoiceItem.productNameSnapshot as string) ?? '',
        unitNameSnapshot: (invoiceItem.unitNameSnapshot as string) ?? '',
        reason: item.reason,
        reasonNote: item.reasonNote ?? null,
      };
    });
  }

  private toAuditSnapshot(
    salesReturn: SalesReturnEntity,
  ): Record<string, unknown> {
    return {
      code: salesReturn.code,
      status: salesReturn.status,
      invoiceId: salesReturn.invoiceId,
      totalAmount: salesReturn.totalAmount,
      itemCount: salesReturn.items.length,
    };
  }

  private toLifecycleEvent(
    salesReturn: SalesReturnEntity,
    actor: ActorContext,
  ) {
    return {
      organizationId: actor.organizationId,
      userId: actor.userId,
      salesReturnId: salesReturn.id,
      invoiceId: salesReturn.invoiceId,
      status: salesReturn.status,
      occurredAt: new Date(),
    };
  }

  private mapError(error: unknown): Error {
    if (error instanceof SalesReturnNotFoundError) {
      return new NotFoundException(
        withCode(ErrorCode.SALES_RETURN_NOT_FOUND, error.message),
      );
    }
    if (error instanceof SalesReturnInvoiceItemNotFoundError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.SALES_RETURN_INVOICE_ITEM_NOT_FOUND, error.message),
      );
    }
    if (error instanceof SalesReturnQtyExceededError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.SALES_RETURN_QTY_EXCEEDED, error.message),
      );
    }
    if (error instanceof SalesReturnInvalidTransitionError) {
      return new UnprocessableEntityException(
        withCode(ErrorCode.SALES_RETURN_INVALID_TRANSITION, error.message),
      );
    }
    if (error instanceof SalesReturnVersionConflictError) {
      return new ConflictException(
        withCode(ErrorCode.SALES_RETURN_VERSION_CONFLICT, error.message),
      );
    }
    if (error instanceof SalesReturnConcurrencyRetryError) {
      return new ConflictException(
        withCode(ErrorCode.SALES_RETURN_CONCURRENCY_RETRY, error.message),
      );
    }
    if (
      error instanceof NotFoundException ||
      error instanceof UnprocessableEntityException
    ) {
      return error;
    }
    return error as Error;
  }
}
