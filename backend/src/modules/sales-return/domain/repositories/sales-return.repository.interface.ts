import { Prisma } from '@prisma/client';
import {
  SalesReturnEntity,
  SalesReturnReason,
  SalesReturnRefundEntity,
  SalesReturnRefundMethod,
  SalesReturnStatus,
} from '../entities/sales-return.entity';

export interface CreateSalesReturnItemInput {
  invoiceItemId: string;
  productId: string;
  warehouseId: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  totalAmount: number;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  reason: SalesReturnReason;
  reasonNote: string | null;
}

export interface CreateSalesReturnInput {
  organizationId: string;
  branchId: string;
  invoiceId: string;
  customerId: string | null;
  code: string;
  note: string | null;
  items: CreateSalesReturnItemInput[];
  createdBy: string;
}

export interface UpdateSalesReturnDraftInput {
  note?: string | null;
  items?: CreateSalesReturnItemInput[];
  updatedBy: string;
}

export interface SalesReturnSearchParams {
  organizationId: string;
  invoiceId?: string;
  status?: SalesReturnStatus;
  search?: string;
  page: number;
  limit: number;
}

export interface SalesReturnSearchResult {
  items: SalesReturnEntity[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateSalesReturnRefundInput {
  organizationId: string;
  salesReturnId: string;
  amount: number;
  method: SalesReturnRefundMethod;
  externalReference: string | null;
  createdBy: string;
  /**
   * T053.06E — id của `SalesReturnRefundOperation` (đã `reserve()` thành công ở tầng Application,
   * TRƯỚC khi gọi vào đây) — repository dùng để `markCompleted()` TRONG CÙNG transaction với
   * `SalesReturnRefund.create()` (atomicity proof, mirror `PrismaSupplierDebtRepository.createPayment()`).
   */
  idempotencyOperationId: string;
}

/**
 * Cửa ngõ ghi DUY NHẤT cho SalesReturn/SalesReturnItem/SalesReturnRefund (Decision AD42,
 * ADR-0010 — Repository Boundary). KHÔNG được inject bởi module khác — chỉ dùng nội bộ module
 * `sales-return`.
 *
 * Mọi phương thức chuyển trạng thái, TRỪ `receive()`, tự quản lý transaction của chính nó
 * (không nhận `tx` từ caller) — SalesReturn không cần chia sẻ transaction với repository khác
 * trong các bước đó, khác với Checkout (SPEC-T014 §14).
 *
 * `receive()` là ngoại lệ DUY NHẤT — nhận `tx` từ caller (Application Service, Phase 3), KHÔNG
 * tự mở transaction, đúng Transaction Propagation pattern của `InventoryDomainService`/
 * `CheckoutService` (T013 §14) — để Application Service có thể gọi
 * `InventoryDomainService.increase(tx, ...)` phục hồi tồn kho trong CÙNG transaction với bước
 * khóa InvoiceItem + validate Eligible Quantity (Decision AD44, xem SPEC §13). Quyết định này
 * điều chỉnh so với thiết kế "tự quản lý transaction" ban đầu của SPEC §13's pseudocode — được
 * Architect xác nhận ở Phase 2 (tách rõ ranh giới Phase 2 Repository/Locking khỏi Phase 3
 * Inventory restoration, tránh để lại TODO trong concurrency path).
 */
export interface ISalesReturnRepository {
  create(input: CreateSalesReturnInput): Promise<SalesReturnEntity>;
  findById(
    id: string,
    organizationId: string,
  ): Promise<SalesReturnEntity | null>;
  search(params: SalesReturnSearchParams): Promise<SalesReturnSearchResult>;

  /** Chỉ hợp lệ khi status = DRAFT. */
  updateDraft(
    id: string,
    organizationId: string,
    version: number,
    input: UpdateSalesReturnDraftInput,
  ): Promise<SalesReturnEntity>;

  /** DRAFT → SUBMITTED. */
  submit(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity>;

  /** SUBMITTED → APPROVED. */
  approve(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity>;

  /**
   * APPROVED → RECEIVED. Khóa InvoiceItem liên quan (raw SQL `SELECT ... FOR UPDATE`, Decision
   * AD44), tính lại Eligible Quantity từ dữ liệu ĐÃ COMMIT (đọc trong CÙNG `tx`, sau khi có
   * lock), validate, chuyển trạng thái — TẤT CẢ trong `tx` do caller cung cấp. KHÔNG tự
   * commit/rollback. KHÔNG gọi InventoryDomainService ở đây — Application Service (Phase 3) gọi
   * `InventoryDomainService.increase(tx, ...)` SAU khi phương thức này resolve, trong CÙNG `tx`,
   * cho từng dòng không phải SERVICE (Decision AD45). Xem SPEC §13, Phase 2 Architect Review.
   *
   * Ném `SalesReturnQtyExceededError` nếu vượt Eligible Quantity, `SalesReturnConcurrencyRetryError`
   * nếu deadlock/lock-timeout từ Postgres.
   */
  receive(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity>;

  /** RECEIVED → COMPLETED. Refund KHÔNG phải điều kiện tiên quyết (Decision AD43). */
  complete(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity>;

  /** [DRAFT, SUBMITTED, APPROVED] → CANCELLED. Không thể hủy sau khi đã RECEIVED. */
  cancel(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnEntity>;

  // --- Refund (lifecycle độc lập với SalesReturn.status — SPEC §14/§15/Decision AD43, KHÔNG đổi:
  // SalesReturn COMPLETED KHÔNG phụ thuộc Refund tạo/hoàn tất) ---

  /**
   * T053.06E — TỰ mở `prisma.$transaction()` riêng (KHÔNG nhận `tx` từ caller — khác `receive()`
   * ở trên, vì ở đây KHÔNG có nhu cầu chia sẻ transaction với module khác, mirror
   * `PrismaSupplierDebtRepository.createPayment()`). Bên trong: khóa `SalesReturn` (`FOR UPDATE`,
   * mirror AD44's InvoiceItem lock) TRƯỚC khi đọc lại trạng thái + tính `activeRefundTotal` — đóng
   * race "different-key concurrency vượt cap" (T053.06E Discovery §14) mà riêng cơ chế Idempotency
   * Key không tự đóng được. Cùng transaction: insert `SalesReturnRefund` + đánh dấu
   * `SalesReturnRefundOperation` COMPLETED (atomicity proof).
   */
  createRefund(
    input: CreateSalesReturnRefundInput,
  ): Promise<SalesReturnRefundEntity>;
  findRefundById(
    id: string,
    organizationId: string,
  ): Promise<SalesReturnRefundEntity | null>;

  /** PENDING → PROCESSING. */
  processRefund(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity>;

  /** PROCESSING → COMPLETED. */
  completeRefund(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity>;

  /** PROCESSING → FAILED. */
  failRefund(
    id: string,
    organizationId: string,
    version: number,
    failureReason: string,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity>;

  /** PENDING → CANCELLED. */
  cancelRefund(
    id: string,
    organizationId: string,
    version: number,
    updatedBy: string,
  ): Promise<SalesReturnRefundEntity>;
}

export const SALES_RETURN_REPOSITORY = Symbol('SALES_RETURN_REPOSITORY');
