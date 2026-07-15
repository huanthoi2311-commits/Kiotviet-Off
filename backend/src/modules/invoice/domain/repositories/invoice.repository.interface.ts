import { Prisma } from '@prisma/client';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';

export interface CreateInvoiceItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxAmount?: number;
  totalAmount: number;
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
