import { Prisma } from '@prisma/client';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';

export interface CreateInvoiceItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxAmount?: number;
  totalAmount: number;
  /** Mandatory Snapshot (SPEC-T013-SALES-FOUNDATION-001 §1.3, Decision SP07). */
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  /** Conditional Snapshot — null nếu dòng hàng không gắn Barcode cụ thể. */
  barcodeId?: string | null;
  barcodeSnapshot?: string | null;
}

export interface CreateInvoiceInput {
  organizationId: string;
  branchId: string;
  customerId?: string | null;
  code: string;
  status: InvoiceStatus;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  items: CreateInvoiceItemInput[];
  createdBy: string;
  /** Mandatory Snapshot — null nếu Invoice không gắn Customer (khách lẻ). */
  customerCodeSnapshot?: string | null;
  customerNameSnapshot?: string | null;
  customerPhoneSnapshot?: string | null;
}

export interface InvoiceSearchParams {
  organizationId: string;
  customerId?: string;
  status?: InvoiceStatus;
  page: number;
  limit: number;
}

export interface InvoiceSearchResult {
  items: InvoiceEntity[];
  total: number;
  page: number;
  limit: number;
}

/**
 * "Basic invoice" (Prompt 035) — module này chỉ GHI THÊM (create, luôn kèm items, luôn
 * trong transaction của Checkout Engine) và ĐỌC (findById/search). Không có update/delete —
 * hóa đơn là chứng từ bất biến sau khi tạo; đổi trạng thái (vd CANCELLED qua Refund) thuộc
 * phạm vi Volume 036-040 (mở rộng, không phải viết lại).
 */
export interface IInvoiceRepository {
  create(
    input: CreateInvoiceInput,
    tx?: Prisma.TransactionClient,
  ): Promise<InvoiceEntity>;
  findById(id: string, organizationId: string): Promise<InvoiceEntity | null>;
  search(params: InvoiceSearchParams): Promise<InvoiceSearchResult>;
}

export const INVOICE_REPOSITORY = Symbol('INVOICE_REPOSITORY');
